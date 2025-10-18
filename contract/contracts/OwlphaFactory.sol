// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {PythagoreanBondingCurve} from "./PythagoreanBondingCurve.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract OwlphaFactory is ERC1155, Ownable {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    error InvalidMarketEndTime();
    error InvalidTokenId();

    struct Market {
        bool exists;
        string question;
        uint256 endTime;
        address collateralToken;
        uint8 collateralDecimals;
        uint256 yesTokenId;
        uint256 noTokenId;
        bool settled;
        uint256 winningTokenId;
        uint256 totalCollateral;
        // Curve state
        uint256 sYes; // total YES supply (ERC1155) participating in curve
        uint256 sNo;  // total NO supply (ERC1155)
        uint256 reserveR; // collateral reserve tracked by curve
        uint256 cWad; // coefficient in wad (>= 1e18 at genesis)
        uint256 unitWad; // price unit scale (wad), default 1e18
    }

    struct CreateMarketCache {
        uint8 decimals;
        uint256 yesTokenId;
        uint256 noTokenId;
        uint256 liquidityScaled;
    }

    uint256 public constant MAX_TAKE_FEE = 2000;
    uint256 public TAKE_FEE;

    mapping(bytes32 => Market) private _markets;
    mapping(uint256 => uint256) private _tokenSupply;
    mapping(bytes32 => address) private _creators;

    uint256 private _nextTokenId = 1;
    string private _baseTokenURI;

    event Owlpha_MarketCreated(
        bytes32 indexed conditionId,
        address indexed creator,
        uint256 yesTokenId,
        uint256 noTokenId,
        string question,
        uint256 endTime,
        address collateralToken
    );

    // Off-chain note (e.g., LLM settlement JSON or CID)
    event Owlpha_MarketNote(bytes32 indexed conditionId, address indexed author, string note);

    event Owlpha_MarketSettled(bytes32 indexed conditionId, uint256 winningTokenId, address indexed settler);
    event Owlpha_PositionRedeemed(bytes32 indexed conditionId, address indexed redeemer, uint256 payoutAmount, uint256 feeAmount);
    event Owlpha_TakeFeeUpdated(uint256 newFee);
    event Owlpha_Trade(
        bytes32 indexed conditionId,
        uint8 side, // 0=YES buy,1=NO buy,2=YES sell,3=NO sell
        uint256 dS,
        uint256 collateralDelta,
        uint256 sYes,
        uint256 sNo,
        uint256 reserveR,
        uint256 cWad
    );

    constructor(string memory baseURI_) ERC1155("") Ownable(msg.sender) {
        _baseTokenURI = baseURI_;
    }

    function createPredictionMarket(
        uint256 initialLiquidity,
        address collateralToken,
        string calldata question,
        uint256 endTime
    ) external returns (bytes32 conditionId) {
        if (endTime <= block.timestamp) {
            revert InvalidMarketEndTime();
        }
        if (initialLiquidity == 0) {
            revert("Invalid liquidity wtf");
        }
        if (collateralToken == address(0)) {
            revert("Collateral must not be zero address");
        }

        conditionId = keccak256(abi.encode(question, endTime, collateralToken));
        Market storage market = _markets[conditionId];
        require(!market.exists, "Market already exists");

        CreateMarketCache memory cache;
        cache.decimals = _getCollateralDecimals(collateralToken);
        cache.yesTokenId = _nextTokenId++;
        cache.noTokenId = _nextTokenId++;

        _transferIn(collateralToken, msg.sender, initialLiquidity);

        market.exists = true;
        market.question = question;
        market.endTime = endTime;
        market.collateralToken = collateralToken;
        market.collateralDecimals = cache.decimals;
        market.yesTokenId = cache.yesTokenId;
        market.noTokenId = cache.noTokenId;
        market.settled = false;
        market.winningTokenId = 0;
        market.totalCollateral = initialLiquidity;

        cache.liquidityScaled = PythagoreanBondingCurve.collateralToDecision(initialLiquidity, cache.decimals);

        // Initialize curve: equal YES/NO supplies and reserve = initialLiquidity
        market.sYes = cache.liquidityScaled;
        market.sNo = cache.liquidityScaled;
        market.reserveR = initialLiquidity;
        market.unitWad = 1e18;
        market.cWad = PythagoreanBondingCurve.computeC(market.reserveR, market.unitWad, market.sYes, market.sNo);

        _mint(msg.sender, cache.yesTokenId, cache.liquidityScaled, "");
        _mint(msg.sender, cache.noTokenId, cache.liquidityScaled, "");
        _tokenSupply[cache.yesTokenId] = cache.liquidityScaled;
        _tokenSupply[cache.noTokenId] = cache.liquidityScaled;

        _creators[conditionId] = msg.sender;

        emit Owlpha_MarketCreated(
            conditionId,
            msg.sender,
            cache.yesTokenId,
            cache.noTokenId,
            market.question,
            market.endTime,
            market.collateralToken
        );
    }

    /// @notice Attach a human/LLM-readable settlement note (JSON or URI) to a market via event
    function attachMarketNote(bytes32 conditionId, string calldata note) external {
        Market storage market = _getMarket(conditionId);
        require(msg.sender == _creators[conditionId], "only creator");
        emit Owlpha_MarketNote(conditionId, msg.sender, note);
    }

    // legacy mint/burn removed in favor of curve-based trading

    // ============ Curve-based trading (no fees) ============
    function buyYes(bytes32 conditionId, uint256 dS, uint256 maxCollateral) external {
        if (dS == 0) revert("Invalid amount");
        Market storage market = _getMarket(conditionId);
        _validateTradingOpen(market);

        uint256 cost = PythagoreanBondingCurve.costToBuyYes(
            market.sYes,
            market.sNo,
            market.cWad,
            market.unitWad,
            dS
        );
        if (cost == 0) revert("Zero cost");
        require(cost <= maxCollateral, "slippage");
        _transferIn(market.collateralToken, msg.sender, cost);

        market.sYes += dS;
        market.reserveR += cost;
        market.cWad = PythagoreanBondingCurve.computeC(market.reserveR, market.unitWad, market.sYes, market.sNo);

        _mint(msg.sender, market.yesTokenId, dS, "");
        _tokenSupply[market.yesTokenId] += dS;

        emit Owlpha_Trade(conditionId, 0, dS, cost, market.sYes, market.sNo, market.reserveR, market.cWad);
    }

    function buyNo(bytes32 conditionId, uint256 dS, uint256 maxCollateral) external {
        if (dS == 0) revert("Invalid amount");
        Market storage market = _getMarket(conditionId);
        _validateTradingOpen(market);

        uint256 cost = PythagoreanBondingCurve.costToBuyNo(
            market.sYes,
            market.sNo,
            market.cWad,
            market.unitWad,
            dS
        );
        if (cost == 0) revert("Zero cost");
        require(cost <= maxCollateral, "slippage");
        _transferIn(market.collateralToken, msg.sender, cost);

        market.sNo += dS;
        market.reserveR += cost;
        market.cWad = PythagoreanBondingCurve.computeC(market.reserveR, market.unitWad, market.sYes, market.sNo);

        _mint(msg.sender, market.noTokenId, dS, "");
        _tokenSupply[market.noTokenId] += dS;

        emit Owlpha_Trade(conditionId, 1, dS, cost, market.sYes, market.sNo, market.reserveR, market.cWad);
    }

    function sellYes(bytes32 conditionId, uint256 dS, uint256 minCollateral) external {
        if (dS == 0) revert("Invalid amount");
        Market storage market = _getMarket(conditionId);
        _validateTradingOpen(market);

        uint256 balance = balanceOf(msg.sender, market.yesTokenId);
        require(balance >= dS, "insufficient YES");

        uint256 proceeds = PythagoreanBondingCurve.proceedsFromSellYes(
            market.sYes,
            market.sNo,
            market.cWad,
            market.unitWad,
            dS
        );
        require(proceeds >= minCollateral, "slippage");

        _burn(msg.sender, market.yesTokenId, dS);
        _tokenSupply[market.yesTokenId] -= dS;

        market.sYes -= dS;
        market.reserveR -= proceeds;
        market.cWad = PythagoreanBondingCurve.computeC(market.reserveR, market.unitWad, market.sYes, market.sNo);

        _transferOut(market.collateralToken, msg.sender, proceeds);

        emit Owlpha_Trade(conditionId, 2, dS, proceeds, market.sYes, market.sNo, market.reserveR, market.cWad);
    }

    function sellNo(bytes32 conditionId, uint256 dS, uint256 minCollateral) external {
        if (dS == 0) revert("Invalid amount");
        Market storage market = _getMarket(conditionId);
        _validateTradingOpen(market);

        uint256 balance = balanceOf(msg.sender, market.noTokenId);
        require(balance >= dS, "insufficient NO");

        uint256 proceeds = PythagoreanBondingCurve.proceedsFromSellNo(
            market.sYes,
            market.sNo,
            market.cWad,
            market.unitWad,
            dS
        );
        require(proceeds >= minCollateral, "slippage");

        _burn(msg.sender, market.noTokenId, dS);
        _tokenSupply[market.noTokenId] -= dS;

        market.sNo -= dS;
        market.reserveR -= proceeds;
        market.cWad = PythagoreanBondingCurve.computeC(market.reserveR, market.unitWad, market.sYes, market.sNo);

        _transferOut(market.collateralToken, msg.sender, proceeds);

        emit Owlpha_Trade(conditionId, 3, dS, proceeds, market.sYes, market.sNo, market.reserveR, market.cWad);
    }

    function settleMarket(bytes32 conditionId, uint256 winningTokenId) external onlyOwner {
        Market storage market = _getMarket(conditionId);

        if (block.timestamp < market.endTime) {
            revert("Market ain't finished yet");
        }
        if (market.settled) {
            revert("Market already settled brother");
        }

        _validateTokenId(market, winningTokenId);

        market.settled = true;
        market.winningTokenId = winningTokenId;

        emit Owlpha_MarketSettled(conditionId, winningTokenId, msg.sender);
    }

    function redeemPosition(bytes32 conditionId) external {
        Market storage market = _getMarket(conditionId);

        if (!market.settled) {
            revert("Market not settled");
        }

        uint256 winningTokenId = market.winningTokenId;
        uint256 balance = balanceOf(msg.sender, winningTokenId);
        if (balance == 0) {
            revert("No winning tokens to redeem");
        }

        // Determine winner supply
        uint256 sWinner = winningTokenId == market.yesTokenId ? market.sYes : market.sNo;
        // Pro-rata payout from reserve
        // payout = reserveR * balance / sWinner
        uint256 payoutAmount = Math.mulDiv(market.reserveR, balance, sWinner);

        // Update supplies and reserve
        _burn(msg.sender, winningTokenId, balance);
        _tokenSupply[winningTokenId] -= balance;
        if (winningTokenId == market.yesTokenId) {
            market.sYes -= balance;
        } else {
            market.sNo -= balance;
        }
        market.reserveR -= payoutAmount;

        // Recompute c from new state
        market.cWad = PythagoreanBondingCurve.computeC(market.reserveR, market.unitWad, market.sYes, market.sNo);

        _transferOut(market.collateralToken, msg.sender, payoutAmount);

        emit Owlpha_PositionRedeemed(conditionId, msg.sender, payoutAmount, 0);
    }

    function setTakeFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_TAKE_FEE) {
            revert("Invalid take fee");
        }
        TAKE_FEE = newFee;
        emit Owlpha_TakeFeeUpdated(newFee);
    }

    function isMarketCreated(bytes32 conditionId) external view returns (bool) {
        return _markets[conditionId].exists;
    }

    function marketQuestion(bytes32 conditionId) external view returns (string memory) {
        Market storage market = _getMarket(conditionId);
        return market.question;
    }

    function marketCreator(bytes32 conditionId) external view returns (address) {
        return _creators[conditionId];
    }

    function marketEndTime(bytes32 conditionId) external view returns (uint256) {
        Market storage market = _getMarket(conditionId);
        return market.endTime;
    }

    function collateralToken(bytes32 conditionId) external view returns (address) {
        Market storage market = _getMarket(conditionId);
        return market.collateralToken;
    }

    function getYesTokenId(bytes32 conditionId) external view returns (uint256) {
        Market storage market = _getMarket(conditionId);
        return market.yesTokenId;
    }

    function getNoTokenId(bytes32 conditionId) external view returns (uint256) {
        Market storage market = _getMarket(conditionId);
        return market.noTokenId;
    }

    function marketSettled(bytes32 conditionId) external view returns (bool) {
        return _markets[conditionId].settled;
    }

    function winningTokenId(bytes32 conditionId) external view returns (uint256) {
        return _markets[conditionId].winningTokenId;
    }

    function totalSupply(uint256 id) external view returns (uint256) {
        return _tokenSupply[id];
    }

    function marketReserve(bytes32 conditionId) external view returns (uint256) {
        return _markets[conditionId].reserveR;
    }

    function marketSupplies(bytes32 conditionId) external view returns (uint256 sYes, uint256 sNo) {
        Market storage m = _markets[conditionId];
        return (m.sYes, m.sNo);
    }

    function marketScale(bytes32 conditionId) external view returns (uint256 cWad, uint256 unitWad) {
        Market storage m = _markets[conditionId];
        return (m.cWad, m.unitWad);
    }

    function getMarketPrice(bytes32 conditionId, uint256 tokenId) external view returns (uint256) {
        Market storage m = _markets[conditionId];
        uint256 p;
        if (tokenId == m.yesTokenId) {
            p = PythagoreanBondingCurve.priceYes(m.sYes, m.sNo);
        } else if (tokenId == m.noTokenId) {
            p = PythagoreanBondingCurve.priceNo(m.sYes, m.sNo);
        } else {
            revert InvalidTokenId();
        }
        // price in collateral/token (wad): (cWad * unitWad * p) / 1e36
        uint256 tmp = Math.mulDiv(m.cWad, m.unitWad, 1e18);
        return Math.mulDiv(tmp, p, 1e18);
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        return string.concat(_baseTokenURI, tokenId.toString());
    }

    function _getMarket(bytes32 conditionId) private view returns (Market storage market) {
        market = _markets[conditionId];
        if (!market.exists) {
            revert("Market doesn't exist");
        }
    }

    function _validateTradingOpen(Market storage market) private view {
        if (block.timestamp >= market.endTime || market.settled) {
            revert("Market trading stopped");
        }
    }

    function _validateTokenId(Market storage market, uint256 tokenId) private view {
        if (tokenId != market.yesTokenId && tokenId != market.noTokenId) {
            revert InvalidTokenId();
        }
    }

    function _getCollateralDecimals(address collateral) private view returns (uint8) {
        try IERC20Metadata(collateral).decimals() returns (uint8 value) {
            return value;
        } catch {
            return 18;
        }
    }

    function _transferIn(address token, address from, uint256 amount) private {
        IERC20(token).safeTransferFrom(from, address(this), amount);
    }

    function _transferOut(address token, address to, uint256 amount) private {
        IERC20(token).safeTransfer(to, amount);
    }
}