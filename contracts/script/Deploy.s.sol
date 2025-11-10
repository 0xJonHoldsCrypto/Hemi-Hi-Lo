// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import {HiLoRange} from "../src/HiLoRange.sol";

contract Deploy is Script {
    function run() external {
        // Load from .env
        address usdc       = vm.envAddress("USDC_E");
        address bitcoinKit = vm.envAddress("BITCOIN_KIT");
        address treasury   = vm.envAddress("TREASURY");
        uint256 maxBet     = vm.envUint("MAX_BET");
        uint256 maxProfit  = vm.envUint("MAX_PROFIT");
        bytes32 commit     = vm.envBytes32("SERVER_SEED_COMMIT");
        uint256 pk         = vm.envUint("PRIVATE_KEY");

        // Start broadcast
        vm.startBroadcast(pk);

        // Deploy the HiLoRange contract
        HiLoRange game = new HiLoRange(
            usdc,
            bitcoinKit,
            treasury,
            maxBet,
            maxProfit,
            commit
        );

        vm.stopBroadcast();

        // Log address for front-end .env update
        console2.log("HiLoRange deployed at:", address(game));
        console2.log("Next step:");
        console2.log("export VITE_CONTRACT_ADDRESS=%s", address(game));
    }
}