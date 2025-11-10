// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/* ---------- Minimal ERC20 ---------- */
interface IERC20 {
    function transfer(address to, uint256 amt) external returns (bool);
    function transferFrom(address from, address to, uint256 amt) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/* ---------- HiLoRange, HBK-agnostic decoding ---------- */
contract HiLoRange {
    /* ---------- Admin / Config ---------- */
    address public owner;
    address public treasury;
    IERC20  public immutable USDCe;
    address public bitcoin; // HBK contract address (no typed interface)

    // House edge in basis points (100 = 1.00%)
    uint256 public houseEdgeBps = 100;
    uint256 public maxBet;    // USDC.e base units
    uint256 public maxProfit; // USDC.e base units
    bool    public paused;
    uint256 public btcDelay = 2; // resolves at (last btc height + delay)

    // Provable fairness seeds
    bytes32 public serverSeedCommit;      // commit now (keccak256(secret))
    string  public serverSeedReveal = ""; // revealed later (starts empty)

    /* ---------- Bets ---------- */
    struct Bet {
        address player;
        uint128 wager;   // USDC.e units
        uint16  low;     // inclusive 0..9999
        uint16  high;    // inclusive 0..9999
        uint64  placedAt;
        uint32  btcHeight;
        bool    settled;
        bool    won;
        uint16  roll;    // 0..9999
    }

    uint256 public nextBetId;
    mapping(uint256 => Bet) public bets;

    /* ---------- Events ---------- */
    event Placed(uint256 indexed betId, address indexed player, uint128 wager, uint16 low, uint16 high, uint32 btcHeight);
    event Settled(uint256 indexed betId, bool won, uint16 roll, uint256 payout);
    event ServerSeedCommitted(bytes32 commit);
    event ServerSeedRevealed(string reveal);

    /* ---------- Modifiers ---------- */
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier notPaused() { require(!paused, "paused"); _; }

    /* ---------- Constructor ---------- */
    constructor(
        address usdcE_,
        address bitcoinKit_,
        address treasury_,
        uint256 maxBet_,
        uint256 maxProfit_,
        bytes32 serverSeedCommit_
    ) {
        owner = msg.sender;
        treasury = treasury_;
        USDCe = IERC20(usdcE_);
        bitcoin = bitcoinKit_;
        maxBet = maxBet_;
        maxProfit = maxProfit_;
        serverSeedCommit = serverSeedCommit_;
        emit ServerSeedCommitted(serverSeedCommit_);
    }

    /* ---------- Admin ops ---------- */
    function setHouseEdge(uint256 bps) external onlyOwner {
        require(bps <= 500, "edge too high");
        houseEdgeBps = bps;
    }
    function setCaps(uint256 _maxBet, uint256 _maxProfit) external onlyOwner {
        maxBet = _maxBet;
        maxProfit = _maxProfit;
    }
    function setPaused(bool p) external onlyOwner { paused = p; }
    function setTreasury(address t) external onlyOwner { treasury = t; }
    function setBtcDelay(uint256 d) external onlyOwner { require(d > 0 && d < 20, "bad delay"); btcDelay = d; }
    function setBitcoinKit(address a) external onlyOwner { require(a != address(0), "bad hbk"); bitcoin = a; }

    function revealServerSeed(string calldata reveal_) external onlyOwner {
        require(bytes(serverSeedReveal).length == 0, "already revealed");
        require(keccak256(bytes(reveal_)) == serverSeedCommit, "bad reveal");
        serverSeedReveal = reveal_;
        emit ServerSeedRevealed(reveal_);
    }
    function rotateServerSeed(bytes32 commit_) external onlyOwner {
        require(bytes(serverSeedReveal).length != 0, "reveal first");
        serverSeedReveal = "";
        serverSeedCommit = commit_;
        emit ServerSeedCommitted(commit_);
    }

    /* ---------- HBK low-level helpers ---------- */

    // selectors
    bytes4 private constant SEL_LAST  = bytes4(keccak256("getLastHeader()"));
    bytes4 private constant SEL_HEADN = bytes4(keccak256("getHeaderN(uint32)"));

    // load a 32-byte word from `data` at byte offset `off`
    function _word(bytes memory data, uint256 off) private pure returns (bytes32 w) {
        require(data.length >= off + 32, "HBK:short");
        assembly {
            w := mload(add(add(data, 0x20), off))
        }
    }

    function _getLastHeight() internal view returns (uint32 h) {
        (bool ok, bytes memory data) = bitcoin.staticcall(abi.encodeWithSelector(SEL_LAST));
        require(ok && data.length >= 64, "HBK:last fail");
        // first return word = height
        h = uint32(uint256(_word(data, 0)));
    }

    function _getHeaderHashN(uint32 height) internal view returns (bytes32 bh) {
        (bool ok, bytes memory data) = bitcoin.staticcall(abi.encodeWithSelector(SEL_HEADN, height));
        require(ok && data.length >= 64, "HBK:getN fail");
        // second return word = blockHash
        bh = _word(data, 32);
    }

    /* ---------- Place ---------- */
    function placeBet(
        uint16 low,
        uint16 high,
        string calldata /*playerSeed*/,
        uint256 suggestedDelay,
        uint128 amount
    ) external notPaused {
        require(high >= low && high <= 9999, "bad range");
        require(amount > 0 && amount <= maxBet, "bad amount");

        uint256 rangeSize = uint256(high) - uint256(low) + 1;
        uint256 potentialPayout = (uint256(amount) * (10_000 - houseEdgeBps)) / rangeSize;
        require(potentialPayout - amount <= maxProfit, "profit cap");

        require(USDCe.transferFrom(msg.sender, address(this), amount), "xferFrom fail");

        uint32 lastHeight = _getLastHeight();
        uint32 target = lastHeight + uint32(suggestedDelay > btcDelay ? suggestedDelay : btcDelay);

        uint256 betId = nextBetId++;
        bets[betId] = Bet({
            player: msg.sender,
            wager: amount,
            low: low,
            high: high,
            placedAt: uint64(block.timestamp),
            btcHeight: target,
            settled: false,
            won: false,
            roll: 0
        });

        emit Placed(betId, msg.sender, amount, low, high, target);
    }

    /* ---------- Settle (with height precheck) ---------- */
    function settle(uint256 betId, string calldata playerSeed) external {
        Bet storage b = bets[betId];
        require(!b.settled && b.player != address(0), "bad bet");

        uint32 curHeight = _getLastHeight();
        require(curHeight >= b.btcHeight, "waiting on HBK height");

        bytes32 hdrHash = _getHeaderHashN(b.btcHeight);
        require(hdrHash != bytes32(0), "header not ready");

        bytes32 mix = keccak256(abi.encodePacked(hdrHash, serverSeedReveal, playerSeed, betId));
        uint16 roll = uint16(uint256(mix) % 10_000);
        b.roll = roll;

        uint256 payout;
        if (roll >= b.low && roll <= b.high) {
            b.won = true;
            uint256 rSize = uint256(b.high) - uint256(b.low) + 1;
            payout = (uint256(b.wager) * (10_000 - houseEdgeBps)) / rSize;
            require(USDCe.balanceOf(address(this)) >= payout, "bankroll low");
            require(USDCe.transfer(b.player, payout), "payout fail");
        }

        b.settled = true;
        emit Settled(betId, b.won, roll, payout);
    }

    /* ---------- Treasury ---------- */
    function deposit(uint256 amt) external {
        require(USDCe.transferFrom(msg.sender, address(this), amt), "deposit fail");
    }
    function withdraw(uint256 amt, address to) external onlyOwner {
        require(to != address(0), "bad to");
        require(USDCe.transfer(to, amt), "withdraw fail");
    }
}
