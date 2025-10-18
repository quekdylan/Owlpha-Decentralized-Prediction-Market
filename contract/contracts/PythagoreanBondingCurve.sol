// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

library PythagoreanBondingCurve {
    uint256 private constant DECIMALS = 18;
    uint256 private constant WAD = 1e18;

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

    // ==========================
    // Pythagorean AMM primitives
    // ==========================

    // norm = sqrt(sYes^2 + sNo^2)
    function norm(uint256 sYes, uint256 sNo) public pure returns (uint256) {
        uint256 a = Math.mulDiv(sYes, sYes, 1);
        uint256 b = Math.mulDiv(sNo, sNo, 1);
        return Math.sqrt(a + b);
    }

    // priceYes = (sYes / norm) in wad
    function priceYes(uint256 sYes, uint256 sNo) public pure returns (uint256) {
        uint256 n = norm(sYes, sNo);
        if (n == 0) return 0;
        return Math.mulDiv(sYes, WAD, n);
    }

    // priceNo = (sNo / norm) in wad
    function priceNo(uint256 sYes, uint256 sNo) public pure returns (uint256) {
        uint256 n = norm(sYes, sNo);
        if (n == 0) return 0;
        return Math.mulDiv(sNo, WAD, n);
    }

    // reserve = (cWad * unitWad * norm) / 1e36
    function reserve(uint256 sYes, uint256 sNo, uint256 cWad, uint256 unitWad) public pure returns (uint256) {
        uint256 n = norm(sYes, sNo);
        if (n == 0) return 0;
        uint256 tmp = Math.mulDiv(n, cWad, WAD);
        return Math.mulDiv(tmp, unitWad, WAD);
    }

    // cost to buy dS YES (holding NO constant)
    function costToBuyYes(
        uint256 sYes,
        uint256 sNo,
        uint256 cWad,
        uint256 unitWad,
        uint256 dS
    ) public pure returns (uint256) {
        if (dS == 0) return 0;
        uint256 rAfter = reserve(sYes + dS, sNo, cWad, unitWad);
        uint256 rBefore = reserve(sYes, sNo, cWad, unitWad);
        return rAfter - rBefore;
    }

    // proceeds from selling dS YES (holding NO constant)
    function proceedsFromSellYes(
        uint256 sYes,
        uint256 sNo,
        uint256 cWad,
        uint256 unitWad,
        uint256 dS
    ) public pure returns (uint256) {
        if (dS == 0) return 0;
        require(dS <= sYes, "sell>sup");
        uint256 rBefore = reserve(sYes, sNo, cWad, unitWad);
        uint256 rAfter = reserve(sYes - dS, sNo, cWad, unitWad);
        return rBefore - rAfter;
    }

    // cost to buy dS NO (holding YES constant)
    function costToBuyNo(
        uint256 sYes,
        uint256 sNo,
        uint256 cWad,
        uint256 unitWad,
        uint256 dS
    ) public pure returns (uint256) {
        if (dS == 0) return 0;
        uint256 rAfter = reserve(sYes, sNo + dS, cWad, unitWad);
        uint256 rBefore = reserve(sYes, sNo, cWad, unitWad);
        return rAfter - rBefore;
    }

    // proceeds from selling dS NO (holding YES constant)
    function proceedsFromSellNo(
        uint256 sYes,
        uint256 sNo,
        uint256 cWad,
        uint256 unitWad,
        uint256 dS
    ) public pure returns (uint256) {
        if (dS == 0) return 0;
        require(dS <= sNo, "sell>sup");
        uint256 rBefore = reserve(sYes, sNo, cWad, unitWad);
        uint256 rAfter = reserve(sYes, sNo - dS, cWad, unitWad);
        return rBefore - rAfter;
    }

    // Recompute c (wad) from current reserve, unit, and supplies: c = reserve / (unit * norm)
    function computeC(uint256 reserveR, uint256 unitWad, uint256 sYes, uint256 sNo) public pure returns (uint256) {
        uint256 n = norm(sYes, sNo);
        if (n == 0 || unitWad == 0) return 0;
        uint256 tmp = Math.mulDiv(reserveR, WAD, unitWad); // reserveR / unit, scaled to wad
        return Math.mulDiv(tmp, WAD, n); // (reserveR / unit) / n, scaled to wad
    }
}