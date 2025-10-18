const { expect } = require("chai");
const { ethers } = require("hardhat");

function sqrtBigInt(n) {
  if (n < 0n) throw new Error("negative");
  if (n < 2n) return n;
  let x0 = n / 2n;
  let x1 = (x0 + n / x0) / 2n;
  while (x1 < x0) { x0 = x1; x1 = (x0 + n / x0) / 2n; }
  return x0;
}

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
    
    it("Should buy YES tokens on curve", async function () {
      const dS = ethers.parseUnits("1000", 18); // buy 1000 YES (18-decimal ERC1155)
      const maxCost = ethers.parseUnits("10000", 6);
      
      const rBefore = await collateralToken.balanceOf(owlphaFactory.target);
      await owlphaFactory.connect(user2).buyYes(conditionId, dS, maxCost);
      
      const balance = await owlphaFactory.balanceOf(user2.address, yesTokenId);
      expect(balance).to.be.gte(dS);
      
      const rAfter = await collateralToken.balanceOf(owlphaFactory.target);
      expect(rAfter).to.be.gt(rBefore);
    });
    
    it("Should revert buy with zero amount", async function () {
      await expect(
        owlphaFactory.connect(user2).buyYes(conditionId, 0, ethers.MaxUint256)
      ).to.be.revertedWith("Invalid amount");
    });

    it("Should revert buying for a non-existent market", async function () {
      const fakeConditionId = ethers.encodeBytes32String("fakeMarket");
      await expect(
        owlphaFactory.connect(user2).buyYes(fakeConditionId, ethers.parseUnits("100", 18), ethers.MaxUint256)
      ).to.be.revertedWith("Market doesn't exist");
    });

    it("Should revert buying after market end time", async function () {
      // Fast forward time past the market end time
      await ethers.provider.send("evm_setNextBlockTimestamp", [marketEndTime + 1]); // Use dynamic marketEndTime
      await ethers.provider.send("evm_mine"); 

      await expect(
        owlphaFactory.connect(user2).buyYes(conditionId, ethers.parseUnits("100", 18), ethers.MaxUint256)
      ).to.be.revertedWith("Market trading stopped");
    });

    it("Should sell YES tokens on curve", async function () {
      // Buy some YES first
      const dS = ethers.parseUnits("1000", 18);
      await owlphaFactory.connect(user2).buyYes(conditionId, dS, ethers.parseUnits("10000", 6));

      const balanceBefore = await owlphaFactory.balanceOf(user2.address, yesTokenId);
      const usdcBefore = await collateralToken.balanceOf(user2.address);

      const sellAmount = balanceBefore / BigInt(2);
      await owlphaFactory.connect(user2).sellYes(conditionId, sellAmount, 0);

      const balanceAfter = await owlphaFactory.balanceOf(user2.address, yesTokenId);
      const usdcAfter = await collateralToken.balanceOf(user2.address);

      expect(balanceAfter).to.equal(balanceBefore - sellAmount);
      expect(usdcAfter).to.be.gt(usdcBefore);
    });

    it("Should revert selling for a non-existent market", async function () {
      const fakeConditionId = ethers.encodeBytes32String("fakeMarket");
      await expect(
        owlphaFactory.connect(user1).sellYes(fakeConditionId, 1, 0)
      ).to.be.revertedWith("Market doesn't exist");
    });

    it("Should revert selling after market end time", async function () {
      // Buy some YES first to have balance
      await owlphaFactory.connect(user2).buyYes(conditionId, ethers.parseUnits("100", 18), ethers.parseUnits("1000000", 6));
      const yesBalance = await owlphaFactory.balanceOf(user2.address, yesTokenId);
      
      // Fast forward time past the market end time
      await ethers.provider.send("evm_setNextBlockTimestamp", [marketEndTime + 1]); // Use dynamic marketEndTime
      await ethers.provider.send("evm_mine"); 

      await expect(
        owlphaFactory.connect(user2).sellYes(conditionId, yesBalance, 0)
      ).to.be.revertedWith("Market trading stopped");
    });

    it("Should revert selling zero tokens", async function () {
      await expect(
        owlphaFactory.connect(user1).sellYes(conditionId, 0, 0)
      ).to.be.revertedWith("Invalid amount");
    });

    it("Should revert selling with insufficient balance", async function () {
      // User2 hasn't bought any NO tokens
      const noBalance = await owlphaFactory.balanceOf(user2.address, noTokenId);
      expect(noBalance).to.equal(0);
      
      await expect(
        owlphaFactory.connect(user2).sellNo(conditionId, 1, 0)
      ).to.be.revertedWith("insufficient NO");
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

      // User2 buys some YES tokens
      await owlphaFactory.connect(user2).buyYes(conditionId, ethers.parseUnits("2000", 18), ethers.parseUnits("1000000", 6));

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

  describe("Curve invariants", function () {
    it("Price circle and reserve invariant hold after trades", async function () {
      // Ensure owner can provide initial liquidity
      await collateralToken.mint(owner.address, INITIAL_LIQUIDITY);
      await collateralToken.connect(owner).approve(owlphaFactory.target, INITIAL_LIQUIDITY);

      const block = await ethers.provider.getBlock('latest');
      const endTime = block.timestamp + 86400;
      const tx = await owlphaFactory.connect(owner).createPredictionMarket(
        INITIAL_LIQUIDITY,
        collateralToken.target,
        MARKET_QUESTION,
        endTime
      );
      const rc = await tx.wait();
      const evt = rc.logs.find(log => owlphaFactory.interface.parseLog(log)?.name === "Owlpha_MarketCreated");
      const conditionId = owlphaFactory.interface.parseLog(evt).args.conditionId;
      const yesTokenId = await owlphaFactory.getYesTokenId(conditionId);
      const noTokenId = await owlphaFactory.getNoTokenId(conditionId);

      // Do a couple of trades
      await owlphaFactory.connect(user1).buyYes(conditionId, ethers.parseUnits("1200", 18), ethers.parseUnits("1", 24));
      await owlphaFactory.connect(user2).buyNo(conditionId, ethers.parseUnits("800", 18), ethers.parseUnits("1", 24));

      // Fetch state
      const [sYes, sNo] = await owlphaFactory.marketSupplies(conditionId);
      const r = await owlphaFactory.marketReserve(conditionId);
      const [cWad, unitWad] = await owlphaFactory.marketScale(conditionId);

      const WAD = 10n ** 18n;
      const norm = sqrtBigInt(sYes * sYes + sNo * sNo);

      // Reserve invariant: r ~= c * unit * sqrt(sYes^2 + sNo^2)
      const rhs = (norm * cWad * unitWad) / (WAD * WAD); // scale back to raw units
      const diff = r > rhs ? r - rhs : rhs - r;
      // relative diff < 0.5%
      expect(diff * 200n <= (r === 0n ? 1n : r)).to.equal(true);
    });
  });
});

