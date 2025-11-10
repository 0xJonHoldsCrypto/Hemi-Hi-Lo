// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;


import {Test} from "forge-std/Test.sol";
import {HiLoRange} from "../src/HiLoRange.sol";


contract MockERC20 {
string public name = "USDC.e";
string public symbol = "USDC.e";
uint8 public decimals = 6;
mapping(address=>uint256) public balanceOf;
mapping(address=>mapping(address=>uint256)) public allowance;
function mint(address to, uint256 amt) external { balanceOf[to]+=amt; }
function approve(address s, uint256 a) external returns(bool){ allowance[msg.sender][s]=a; return true; }
function transfer(address to, uint256 amt) external returns(bool){ require(balanceOf[msg.sender]>=amt,"bal"); balanceOf[msg.sender]-=amt; balanceOf[to]+=amt; return true; }
function transferFrom(address f,address t,uint256 a) external returns(bool){ require(balanceOf[f]>=a && allowance[f][msg.sender]>=a,"allow"); balanceOf[f]-=a; allowance[f][msg.sender]-=a; balanceOf[t]+=a; return true; }
}


contract MockHBK {
struct BitcoinHeader { uint32 height; bytes32 blockHash; uint32 version; bytes32 previousBlockHash; bytes32 merkleRoot; uint32 timestamp; uint32 bits; uint32 nonce; }
uint32 public lastHeight;
mapping(uint32=>BitcoinHeader) public h;
function push(bytes32 bh) external { lastHeight+=1; h[lastHeight]=BitcoinHeader(lastHeight,bh,0,0,0,0,0,0); }
function getLastHeader() external view returns (BitcoinHeader memory){ return h[lastHeight]; }
function getHeaderN(uint32 height) external view returns (BitcoinHeader memory){ return h[height]; }
}


contract HiLoRangeTest is Test {
MockERC20 usdc;
MockHBK hbk;
HiLoRange game;


address alice = address(0xA11CE);


function setUp() public {
usdc = new MockERC20();
hbk = new MockHBK();
// seed some BTC headers
hbk.push(bytes32(uint256(1))); // height 1
hbk.push(bytes32(uint256(2))); // height 2
hbk.push(bytes32(uint256(3))); // height 3


game = new HiLoRange(address(usdc), address(hbk), address(this), 1_000_000e6, 5_000_000e6, keccak256("server-seed"));
usdc.mint(alice, 1_000_000e6);
vm.prank(alice); usdc.approve(address(game), type(uint256).max);
}


function testPlaceAndSettle() public {
// ensure delay=2
game.setBtcDelay(2);


vm.prank(alice);
game.placeBet(0, 4999, "seed", 0, 100e6); // 100 USDC.e on low50


// push two more headers so target is available
hbk.push(bytes32(uint256(4))); // h=4
hbk.push(bytes32(uint256(5))); // h=5


// settle bet 0
game.settle(0, "seed");
// no assertion on win/lose; just ensure it doesn't revert
}
}