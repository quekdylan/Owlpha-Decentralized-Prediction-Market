// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {PythagoreanBondingCurve} from "./PythagoreanBondingCurve.sol";

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

    event Owlpha_MarketSettled(bytes32 indexed conditionId, uint256 winningTokenId, address indexed settler);
    event Owlpha_PositionRedeemed(bytes32 indexed conditionId, address indexed redeemer, uint256 payoutAmount, uint256 feeAmount);
    event Owlpha_TakeFeeUpdated(uint256 newFee);

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

        _mint(msg.sender, cache.yesTokenId, cache.liquidityScaled, "");
        _mint(msg.sender, cache.noTokenId, cache.liquidityScaled, "");
        _tokenSupply[cache.yesTokenId] = cache.liquidityScaled;
        _tokenSupply[cache.noTokenId] = cache.liquidityScaled;

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

    function mintDecisionTokens(bytes32 conditionId, uint256 collateralAmount, uint256 tokenId) external {
        if (collateralAmount == 0) {
            revert("Invalid collateral amount");
        }

        Market storage market = _getMarket(conditionId);
        _validateTradingOpen(market);
        _validateTokenId(market, tokenId);

        _transferIn(market.collateralToken, msg.sender, collateralAmount);

        uint256 mintAmount = PythagoreanBondingCurve.collateralToDecision(collateralAmount, market.collateralDecimals);
        _mint(msg.sender, tokenId, mintAmount, "");
        _tokenSupply[tokenId] += mintAmount;
        market.totalCollateral += collateralAmount;
    }

    function burnDecisionTokens(bytes32 conditionId, uint256 tokenId, uint256 amount) external {
        if (amount == 0) {
            revert("Invalid amount");
        }

        Market storage market = _getMarket(conditionId);
        _validateTradingOpen(market);
        _validateTokenId(market, tokenId);

        uint256 balance = balanceOf(msg.sender, tokenId);
        if (balance < amount) {
            revert("Insufficient balance");
        }

        uint256 collateralValue = PythagoreanBondingCurve.decisionToCollateral(amount, market.collateralDecimals);

        _burn(msg.sender, tokenId, amount);
        _tokenSupply[tokenId] -= amount;
        market.totalCollateral -= collateralValue;

        _transferOut(market.collateralToken, msg.sender, collateralValue);
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

        uint256 collateralAmount = PythagoreanBondingCurve.decisionToCollateral(balance, market.collateralDecimals);

        _burn(msg.sender, winningTokenId, balance);
        _tokenSupply[winningTokenId] -= balance;
        market.totalCollateral -= collateralAmount;

        uint256 feeAmount = (collateralAmount * TAKE_FEE) / 10_000;
        uint256 payoutAmount = collateralAmount - feeAmount;

        if (payoutAmount > 0) {
            _transferOut(market.collateralToken, msg.sender, payoutAmount);
        }
        if (feeAmount > 0) {
            _transferOut(market.collateralToken, owner(), feeAmount);
        }

        emit Owlpha_PositionRedeemed(conditionId, msg.sender, payoutAmount, feeAmount);
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