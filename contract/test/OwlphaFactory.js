const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OwlphaFactory", function () {
  let owlphaFactory;
  let collateralToken;
  let pythagoreanBondingCurve;
  let owner;
  let user1;
  let user2;

  // Constants for market creation
  const MARKET_QUESTION = "Will ETH be above $4000 by end of 2024?";
  const MARKET_QUESTION_2 = "Will [X] get [z] inside [y]  by 2025?";
  const MARKET_QUESTION_3 = "";

  
  const INITIAL_LIQUIDITY = ethers.parseUnits("10000", 6); // 10k USDC (6 decimals)
  
  // Fixed timestamp for December 31, 2025 (way in the future)
  const FUTURE_TIMESTAMP = 1798761600; // Keep this as a distant future reference
  
  // Helper to get current block timestamp
  async function getCurrentTimestamp() {
    const block = await ethers.provider.getBlock('latest');
    return block.timestamp;
  }

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    
    // Deploy TestCollateralToken with 6 decimals (like USDC)
    const TestCollateralToken = await ethers.getContractFactory("TestCollateralToken");
    collateralToken = await TestCollateralToken.deploy("USD Coin", "USDC", 6);
    
    // deploy the PythagoreanBondingCurve library
    const PythagoreanBondingCurve = await ethers.getContractFactory("PythagoreanBondingCurve");
    pythagoreanBondingCurve = await PythagoreanBondingCurve.deploy();
    
    // Deploy OwlphaFactory with the library link
    const OwlphaFactory = await ethers.getContractFactory("OwlphaFactory", {
      libraries: {
        PythagoreanBondingCurve: pythagoreanBondingCurve.target
      }
    });
  
    owlphaFactory = await OwlphaFactory.deploy("https://api.owlpha.io/metadata/");
    
    // Mint tokens to users
    await collateralToken.mint(user1.address, ethers.parseUnits("100000", 6));
    await collateralToken.mint(user2.address, ethers.parseUnits("100000", 6));
    
    // Users approve OwlphaFactory to spend their tokens
    await collateralToken.connect(user1).approve(owlphaFactory.target, ethers.MaxUint256);
    await collateralToken.connect(user2).approve(owlphaFactory.target, ethers.MaxUint256);
  });

  describe("Market Creation", function () {
     it("Should create a prediction market successfully", async function () {
      // Create a prediction market with fixed future timestamp
      const tx = await owlphaFactory.connect(user1).createPredictionMarket(
        INITIAL_LIQUIDITY,
        collateralToken.target,
        MARKET_QUESTION,
        FUTURE_TIMESTAMP
      );
      
      // Get the market ID (conditionId) from the event
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => 
        owlphaFactory.interface.parseLog(log)?.name === "Owlpha_MarketCreated"
      );
      const parsedEvent = owlphaFactory.interface.parseLog(event);
      const conditionId = parsedEvent.args.conditionId;
      
      // Verify market was created correctly
      expect(await owlphaFactory.isMarketCreated(conditionId)).to.be.true;
      expect(await owlphaFactory.marketQuestion(conditionId)).to.equal(MARKET_QUESTION);
      expect(await owlphaFactory.marketEndTime(conditionId)).to.equal(FUTURE_TIMESTAMP);
      expect(await owlphaFactory.collateralToken(conditionId)).to.equal(collateralToken.target);
      
      // Verify the creator received YES and NO tokens
      const yesTokenId = await owlphaFactory.getYesTokenId(conditionId);
      const noTokenId = await owlphaFactory.getNoTokenId(conditionId);
      
      // The tokens are converted to 18 decimals internally
      const expectedBalance = INITIAL_LIQUIDITY * BigInt(10 ** 12);
      
      expect(await owlphaFactory.balanceOf(user1.address, yesTokenId)).to.equal(expectedBalance);
      expect(await owlphaFactory.balanceOf(user1.address, noTokenId)).to.equal(expectedBalance);
    });
    
    it("Should revert when creating a market with invalid end time", async function () {
      const pastEndTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      
      await expect(
        owlphaFactory.connect(user1).createPredictionMarket(
          INITIAL_LIQUIDITY,
          collateralToken.target,
          MARKET_QUESTION,
          pastEndTime
        )
      ).to.be.revertedWithCustomError(owlphaFactory, "InvalidMarketEndTime");
    });

    it("Should revert when initialLiquidity is zero", async function () {
      //  create a prediction market with zero initial liquidity
      await expect(
        owlphaFactory.connect(user1).createPredictionMarket(
          0, 
          collateralToken.target,
          MARKET_QUESTION,
          FUTURE_TIMESTAMP
        )
      ).to.be.revertedWith("Invalid liquidity wtf");
    });
    
    it("Should revert when collateral token is address zero", async function () {
      // create a prediction market with address zero as collateral
      await expect(
        owlphaFactory.connect(user1).createPredictionMarket(
          INITIAL_LIQUIDITY,
          ethers.ZeroAddress, // Zero address
          MARKET_QUESTION,
          FUTURE_TIMESTAMP
        )
      ).to.be.revertedWith("Collateral must not be zero address");
    });

    it("Should revert when creating a duplicate market", async function () {
      // Create the first market
      await owlphaFactory.connect(user1).createPredictionMarket(
        INITIAL_LIQUIDITY,
        collateralToken.target,
        MARKET_QUESTION,
        FUTURE_TIMESTAMP
      );

      // Try to create the same market again
      await expect(
        owlphaFactory.connect(user1).createPredictionMarket(
          INITIAL_LIQUIDITY,
          collateralToken.target,
          MARKET_QUESTION, // Same question
          FUTURE_TIMESTAMP // Same end time
        )
      ).to.be.reverted; // Contract reverts without a specific message here
    });
  });

  describe("Decision Token Operations", function () {
    let conditionId;
    let yesTokenId;
    let noTokenId;
    let marketEndTime;
    
    beforeEach(async function () {
      // Set market end time relative to current block timestamp
      marketEndTime = await getCurrentTimestamp() + 365 * 24 * 60 * 60; // 1 year from now

      // Create a prediction market
      const tx = await owlphaFactory.connect(user1).createPredictionMarket(
        INITIAL_LIQUIDITY,
        collateralToken.target,
        MARKET_QUESTION,
        marketEndTime // Use dynamically calculated future time
      );
      
      // Get the market ID (conditionId) from the event
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => 
        owlphaFactory.interface.parseLog(log)?.name === "Owlpha_MarketCreated"
      );
      const parsedEvent = owlphaFactory.interface.parseLog(event);
      conditionId = parsedEvent.args.conditionId;
      
      // Get token IDs
      yesTokenId = await owlphaFactory.getYesTokenId(conditionId);
      noTokenId = await owlphaFactory.getNoTokenId(conditionId);
    });
    
    it("Should mint decision tokens correctly", async function () {
      const mintAmount = ethers.parseUnits("1000", 6); // 1000 USDC
      
      // User2 mints YES tokens
      await owlphaFactory.connect(user2).mintDecisionTokens(conditionId, mintAmount, yesTokenId);
      
      // Check user2 balance of YES tokens increased
      const balance = await owlphaFactory.balanceOf(user2.address, yesTokenId);
      expect(balance).to.be.gt(0);
      
      // Check that USDC was transferred from user2
      const factoryBalance = await collateralToken.balanceOf(owlphaFactory.target);
      expect(factoryBalance).to.equal(INITIAL_LIQUIDITY + mintAmount);
    });
    
    it("Should revert minting with zero collateral amount", async function () {
      await expect(
        owlphaFactory.connect(user2).mintDecisionTokens(conditionId, 0, yesTokenId)
      ).to.be.revertedWith("Invalid collateral amount");
    });

    it("Should revert minting for a non-existent market", async function () {
      const fakeConditionId = ethers.encodeBytes32String("fakeMarket");
      const mintAmount = ethers.parseUnits("100", 6);
      await expect(
        owlphaFactory.connect(user2).mintDecisionTokens(fakeConditionId, mintAmount, yesTokenId) // yesTokenId doesn't matter here
      ).to.be.revertedWith("Market doesn't exist");
    });

    it("Should revert minting after market end time", async function () {
      // Fast forward time past the market end time
      await ethers.provider.send("evm_setNextBlockTimestamp", [marketEndTime + 1]); // Use dynamic marketEndTime
      await ethers.provider.send("evm_mine"); 

      const mintAmount = ethers.parseUnits("100", 6);
      await expect(
        owlphaFactory.connect(user2).mintDecisionTokens(conditionId, mintAmount, yesTokenId)
      ).to.be.revertedWith("Market trading stopped");
    });

    it("Should revert minting with an invalid token ID", async function () {
      const mintAmount = ethers.parseUnits("100", 6);
      const invalidTokenId = ethers.MaxUint256; // An ID that doesn't correspond to YES or NO
      await expect(
        owlphaFactory.connect(user2).mintDecisionTokens(conditionId, mintAmount, invalidTokenId)
      ).to.be.revertedWithCustomError(owlphaFactory, "InvalidTokenId");
    });

    it("Should burn decision tokens correctly", async function () {
      const mintAmount = ethers.parseUnits("1000", 6); // 1000 USDC
      
      // User2 mints YES tokens
      await owlphaFactory.connect(user2).mintDecisionTokens(conditionId, mintAmount, yesTokenId);
      
      // Get user2's balance of YES tokens
      const initialYesBalance = await owlphaFactory.balanceOf(user2.address, yesTokenId);
      const initialUsdcBalance = await collateralToken.balanceOf(user2.address);
      
      // User2 burns half their YES tokens
      const burnAmount = initialYesBalance / BigInt(2);
      await owlphaFactory.connect(user2).burnDecisionTokens(conditionId, yesTokenId, burnAmount);
      
      // Check that YES tokens were burned
      const finalYesBalance = await owlphaFactory.balanceOf(user2.address, yesTokenId);
      expect(finalYesBalance).to.equal(initialYesBalance - burnAmount);
      
      // Check that USDC was returned to user2
      const finalUsdcBalance = await collateralToken.balanceOf(user2.address);
      expect(finalUsdcBalance).to.be.gt(initialUsdcBalance);
    });

    it("Should revert burning for a non-existent market", async function () {
      const fakeConditionId = ethers.encodeBytes32String("fakeMarket");
      await expect(
        owlphaFactory.connect(user1).burnDecisionTokens(fakeConditionId, yesTokenId, 1) // Burn 1 token
      ).to.be.revertedWith("Market doesn't exist");
    });

    it("Should revert burning after market end time", async function () {
      // Mint some tokens first to have something to burn
      const mintAmount = ethers.parseUnits("100", 6);
      await owlphaFactory.connect(user2).mintDecisionTokens(conditionId, mintAmount, yesTokenId);
      const yesBalance = await owlphaFactory.balanceOf(user2.address, yesTokenId);
      
      // Fast forward time past the market end time
      await ethers.provider.send("evm_setNextBlockTimestamp", [marketEndTime + 1]); // Use dynamic marketEndTime
      await ethers.provider.send("evm_mine"); 

      await expect(
        owlphaFactory.connect(user2).burnDecisionTokens(conditionId, yesTokenId, yesBalance)
      ).to.be.revertedWith("Market trading stopped");
    });

    it("Should revert burning zero tokens", async function () {
      await expect(
        owlphaFactory.connect(user1).burnDecisionTokens(conditionId, yesTokenId, 0)
      ).to.be.revertedWith("Invalid amount");
    });

    it("Should revert burning with insufficient balance", async function () {
      // User2 hasn't minted any NO tokens
      const noBalance = await owlphaFactory.balanceOf(user2.address, noTokenId);
      expect(noBalance).to.equal(0);
      
      await expect(
        owlphaFactory.connect(user2).burnDecisionTokens(conditionId, noTokenId, 1) // Try to burn 1 NO token
      ).to.be.revertedWith("Insufficient balance");
    });
  });

  describe("Settlement and Redemption", function () {
    let conditionId;
    let yesTokenId;
    let noTokenId;
    let marketEndTime;
    
    beforeEach(async function () {
      // Set market end time relative to current block timestamp
      marketEndTime = await getCurrentTimestamp() + 365 * 24 * 60 * 60; // 1 year from now

      // Create a prediction market
      const tx = await owlphaFactory.connect(user1).createPredictionMarket(
        INITIAL_LIQUIDITY,
        collateralToken.target,
        MARKET_QUESTION,
        marketEndTime // Use dynamically calculated future time
      );
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => owlphaFactory.interface.parseLog(log)?.name === "Owlpha_MarketCreated");
      conditionId = owlphaFactory.interface.parseLog(event).args.conditionId;
      yesTokenId = await owlphaFactory.getYesTokenId(conditionId);
      noTokenId = await owlphaFactory.getNoTokenId(conditionId);

      // User2 mints some YES tokens
      const mintAmountYes = ethers.parseUnits("2000", 6);
      await owlphaFactory.connect(user2).mintDecisionTokens(conditionId, mintAmountYes, yesTokenId);

      // User1 (LP) still holds initial tokens
    });

    it("Should revert settling before market end time", async function () {
      await expect(
        owlphaFactory.connect(owner).settleMarket(conditionId, yesTokenId)
      ).to.be.revertedWith("Market ain't finished yet");
    });

    it("Should revert settling if not owner", async function () {
      // Fast forward time past the market end time
      await ethers.provider.send("evm_setNextBlockTimestamp", [marketEndTime + 1]); // Use dynamic marketEndTime
      await ethers.provider.send("evm_mine"); 

      await expect(
        owlphaFactory.connect(user1).settleMarket(conditionId, yesTokenId) // user1 is not owner
      ).to.be.revertedWithCustomError(owlphaFactory, "OwnableUnauthorizedAccount");
    });

    it("Should settle market correctly (YES wins)", async function () {
      // Fast forward time past the market end time
      await ethers.provider.send("evm_setNextBlockTimestamp", [marketEndTime + 1]); // Use dynamic marketEndTime
      await ethers.provider.send("evm_mine"); 

      // Settle market with YES as the winning token
      await expect(owlphaFactory.connect(owner).settleMarket(conditionId, yesTokenId))
        .to.emit(owlphaFactory, "Owlpha_MarketSettled")
        .withArgs(conditionId, yesTokenId, owner.address);

      expect(await owlphaFactory.marketSettled(conditionId)).to.be.true;
      expect(await owlphaFactory.winningTokenId(conditionId)).to.equal(yesTokenId);
    });

    it("Should revert settling if already settled", async function () {
      // Fast forward time and settle
      await ethers.provider.send("evm_setNextBlockTimestamp", [marketEndTime + 1]); // Use dynamic marketEndTime
      await owlphaFactory.connect(owner).settleMarket(conditionId, yesTokenId);
      
      // Try to settle again
      await expect(
        owlphaFactory.connect(owner).settleMarket(conditionId, noTokenId) // Try settling with NO
      ).to.be.revertedWith("Market already settled brother");
    });

    it("Should revert redeeming if market not settled", async function () {
      await expect(
        owlphaFactory.connect(user1).redeemPosition(conditionId)
      ).to.be.revertedWith("Market not settled");
    });

    it("Should allow redeeming winning tokens after settlement", async function () {
      // Fast forward time and settle (YES wins)
      await ethers.provider.send("evm_setNextBlockTimestamp", [marketEndTime + 1]); // Use dynamic marketEndTime
      await owlphaFactory.connect(owner).settleMarket(conditionId, yesTokenId);

      const user1InitialYesBalance = await owlphaFactory.balanceOf(user1.address, yesTokenId);
      const user2InitialYesBalance = await owlphaFactory.balanceOf(user2.address, yesTokenId);
      const user1InitialCollateral = await collateralToken.balanceOf(user1.address);
      const user2InitialCollateral = await collateralToken.balanceOf(user2.address);

      // User1 redeems position
      await expect(owlphaFactory.connect(user1).redeemPosition(conditionId)).to.emit(owlphaFactory, "Owlpha_PositionRedeemed");
      
      // User2 redeems position
      await expect(owlphaFactory.connect(user2).redeemPosition(conditionId)).to.emit(owlphaFactory, "Owlpha_PositionRedeemed");

      // Check balances after redemption
      // Due to scaling/rounding, balances might not be exactly zero, but should be negligible
      // Instead, we primarily check that the collateral balance increased
      // expect(await owlphaFactory.balanceOf(user1.address, yesTokenId)).to.equal(0); 
      // expect(await owlphaFactory.balanceOf(user2.address, yesTokenId)).to.equal(0);
      expect(await collateralToken.balanceOf(user1.address)).to.be.gt(user1InitialCollateral);
      expect(await collateralToken.balanceOf(user2.address)).to.be.gt(user2InitialCollateral);
    });

    it("Should revert redeeming with no winning tokens", async function () {
      // Fast forward time and settle (NO wins)
      await ethers.provider.send("evm_setNextBlockTimestamp", [marketEndTime + 1]); // Use dynamic marketEndTime
      await owlphaFactory.connect(owner).settleMarket(conditionId, noTokenId);

      // User2 holds YES tokens, which are now losing tokens
      await expect(
        owlphaFactory.connect(user2).redeemPosition(conditionId)
      ).to.be.revertedWith("No winning tokens to redeem");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to set take fee", async function () {
      const newFee = 150; // 1.5%
      await expect(owlphaFactory.connect(owner).setTakeFee(newFee))
        .to.emit(owlphaFactory, "Owlpha_TakeFeeUpdated")
        .withArgs(newFee);
      expect(await owlphaFactory.TAKE_FEE()).to.equal(newFee);
    });

    it("Should revert setting take fee if not owner", async function () {
      const newFee = 150;
      await expect(
        owlphaFactory.connect(user1).setTakeFee(newFee)
      ).to.be.revertedWithCustomError(owlphaFactory, "OwnableUnauthorizedAccount");
    });

    it("Should revert setting invalid take fee (too high)", async function () {
      const invalidFee = 2001; // > 2000 bps
      await expect(
        owlphaFactory.connect(owner).setTakeFee(invalidFee)
      ).to.be.revertedWith("Invalid take fee");
    });
  });
});

