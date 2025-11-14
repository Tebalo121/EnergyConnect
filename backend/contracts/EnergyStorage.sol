// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract EnergyStorage {
    uint256 public storedEnergy;

    function storeEnergy(uint256 _energy) public {
        storedEnergy = _energy;
    }

    function getEnergy() public view returns (uint256) {
        return storedEnergy;
    }
}