// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library PythagoreanBondingCurve {
    uint256 private constant DECIMALS = 18;

    function collateralToDecision(uint256 collateralAmount, uint8 collateralDecimals) public pure returns (uint256) {
        if (collateralAmount == 0) {
            return 0;
        }

        if (collateralDecimals == DECIMALS) {
            return collateralAmount;
        }

        if (collateralDecimals < DECIMALS) {
            uint256 factor = 10 ** uint256(DECIMALS - collateralDecimals);
            return collateralAmount * factor;
        }

        uint256 divisor = 10 ** uint256(collateralDecimals - DECIMALS);
        return collateralAmount / divisor;
    }

    function decisionToCollateral(uint256 decisionAmount, uint8 collateralDecimals) public pure returns (uint256) {
        if (decisionAmount == 0) {
            return 0;
        }

        if (collateralDecimals == DECIMALS) {
            return decisionAmount;
        }

        if (collateralDecimals < DECIMALS) {
            uint256 divisor = 10 ** uint256(DECIMALS - collateralDecimals);
            return decisionAmount / divisor;
        }

        uint256 factor = 10 ** uint256(collateralDecimals - DECIMALS);
        return decisionAmount * factor;
    }
}