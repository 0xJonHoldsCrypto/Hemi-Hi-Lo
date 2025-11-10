// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";

/// @notice After deploy, update web/.env with new VITE_CONTRACT_ADDRESS
contract PostDeploy is Script {
    function run() external {
        string memory path = "../web/.env"; // write target
        string memory broadcastPath = string.concat(
            "broadcast/Deploy.s.sol/",
            vm.toString(block.chainid),
            "/run-latest.json"
        );

        // read deployed address
        string memory json = vm.readFile(broadcastPath);
        address deployed = vm.parseJsonAddress(json, ".transactions[0].contractAddress");

        // read existing web env
        string memory env = vm.readFile(path);

        // locate the key
        string memory key = "VITE_CONTRACT_ADDRESS=";
        uint256 keyPos = indexOf(env, key);

        string memory newLine = string.concat(key, vm.toString(deployed), "\n");
        string memory updated;

        if (keyPos == 0) {
            // if key not found, append
            updated = string.concat(env, "\n", newLine);
        } else {
            // rebuild with replacement
            uint256 endLine = findNextLineBreak(env, keyPos);
            updated = string.concat(
                substring(env, 0, keyPos),
                newLine,
                substring(env, endLine, bytes(env).length)
            );
        }

        vm.writeFile(path, updated);
        console2.log("Updated web/.env with new VITE_CONTRACT_ADDRESS:", deployed);
    }

    // --- helpers ---
    function indexOf(string memory haystack, string memory needle) internal pure returns (uint256) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0 || n.length > h.length) return 0;
        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool matchFound = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    matchFound = false;
                    break;
                }
            }
            if (matchFound) return i;
        }
        return 0;
    }

    function findNextLineBreak(string memory s, uint256 start) internal pure returns (uint256) {
        bytes memory b = bytes(s);
        for (uint256 i = start; i < b.length; i++) {
            if (b[i] == "\n") return i + 1;
        }
        return b.length;
    }

    function substring(string memory str, uint256 start, uint256 end) internal pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        if (end > strBytes.length) end = strBytes.length;
        bytes memory result = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = strBytes[i];
        }
        return string(result);
    }
}