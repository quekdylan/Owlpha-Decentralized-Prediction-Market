const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  console.log("--- Market Lifecycle Simulation (Separated Roles) ---");

  // === Setup ===
  // owner: Settles market
  // marketCreator: Provides LP
  // user1, user2, user3: Traders
  const [owner, marketCreator, user1, user2, user3] = await ethers.getSigners(); 
  const traders = { user1, user2, user3 }; // Only traders for PNL
  const collateralDecimals = 6; // Like USDC
  const oneToken = ethers.parseUnits("1", collateralDecimals);

  // Store initial balances for PNL (only for traders)
  const initialCollateralBalances = {};
  for (const name in traders) {
    initialCollateralBalances[name] = 0n; // Start at 0 before minting
  }

  console.log("\nDeploying contracts...");
  // Deploy TestCollateralToken
  const TestCollateralToken = await ethers.getContractFactory("TestCollateralToken");
  const collateralToken = await TestCollateralToken.deploy("USD Coin", "USDC", collateralDecimals);
  console.log(`TestCollateralToken deployed to: ${collateralToken.target}`);

  // Deploy PythagoreanBondingCurve library
  const PythagoreanBondingCurve = await ethers.getContractFactory("PythagoreanBondingCurve");
  const pythagoreanBondingCurve = await PythagoreanBondingCurve.deploy();
  console.log(`PythagoreanBondingCurve deployed to: ${pythagoreanBondingCurve.target}`);

  // Deploy OwlphaFactory
  const OwlphaFactory = await ethers.getContractFactory("OwlphaFactory", {
    libraries: { PythagoreanBondingCurve: pythagoreanBondingCurve.target },
  });
  const owlphaFactory = await OwlphaFactory.deploy("https://api.owlpha.com/");
  console.log(`OwlphaFactory deployed to: ${owlphaFactory.target}`);

  // Fund users and approve factory
  console.log("\nFunding users and approving factory...");
  // Fund traders
  await collateralToken.mint(user1.address, oneToken * 100000n);
  initialCollateralBalances.user1 += oneToken * 100000n;
  await collateralToken.mint(user2.address, oneToken * 100000n); 
  initialCollateralBalances.user2 += oneToken * 100000n;
  await collateralToken.mint(user3.address, oneToken * 100000n); 
  initialCollateralBalances.user3 += oneToken * 100000n;
  // Fund marketCreator just enough for LP
  const initialLiquidity = oneToken * 5000n; // 5k USDC liquidity
  await collateralToken.mint(marketCreator.address, initialLiquidity);

  // Approve factory for traders and marketCreator
  // Owner doesn't need approval as settleMarket requires no tokens
  await collateralToken.connect(marketCreator).approve(owlphaFactory.target, initialLiquidity);
  for (const name in traders) {
      await collateralToken.connect(traders[name]).approve(owlphaFactory.target, ethers.MaxUint256);
  }

  // === Market Creation by marketCreator ===
  console.log("\nCreating prediction market (marketCreator as LP)...");
  const question = "Will User 1 and User 3 win this market?";
  const block = await ethers.provider.getBlock('latest');
  const endTime = block.timestamp + 60 * 60 * 24; // 1 day from now

  // marketCreator provides initial liquidity
  const createTx = await owlphaFactory.connect(marketCreator).createPredictionMarket(
    initialLiquidity,
    collateralToken.target,
    question,
    endTime
  );
  const receiptCreate = await createTx.wait();
  const createdEvent = receiptCreate.logs.find(log => owlphaFactory.interface.parseLog(log)?.name === "Owlpha_MarketCreated");
  const conditionId = owlphaFactory.interface.parseLog(createdEvent).args.conditionId;
  const yesTokenId = await owlphaFactory.getYesTokenId(conditionId);
  const noTokenId = await owlphaFactory.getNoTokenId(conditionId);

  console.log(`Market created by marketCreator (${marketCreator.address.substring(0,6)}...) with conditionId: ${conditionId}`);
  console.log(`  Initial Liquidity: ${ethers.formatUnits(initialLiquidity, collateralDecimals)}`);
  console.log(`  YES Token ID: ${yesTokenId}`);
  console.log(`  NO Token ID: ${noTokenId}`);

  // === Initial State & Price Check ===
  console.log("\nChecking initial market state (after LP)...");
  await logMarketState(owlphaFactory, conditionId, yesTokenId, noTokenId, collateralDecimals);

  // === Trading (Curve-based) ===
  console.log("\nSimulating trading...");
  const user1BuyYes = ethers.parseUnits("1000", 18); // 1k YES
  const user2BuyNo = ethers.parseUnits("800", 18);   // 0.8k NO
  const user3BuyYes = ethers.parseUnits("500", 18);  // 0.5k YES

  console.log(`\nUser1 buying ${ethers.formatUnits(user1BuyYes, 18)} YES tokens...`);
  await owlphaFactory.connect(user1).buyYes(conditionId, user1BuyYes, ethers.parseUnits("1000000", collateralDecimals));
  await logMarketState(owlphaFactory, conditionId, yesTokenId, noTokenId, collateralDecimals);

  console.log(`\nUser2 buying ${ethers.formatUnits(user2BuyNo, 18)} NO tokens...`);
  await owlphaFactory.connect(user2).buyNo(conditionId, user2BuyNo, ethers.parseUnits("1000000", collateralDecimals));
  await logMarketState(owlphaFactory, conditionId, yesTokenId, noTokenId, collateralDecimals);

  console.log(`\nUser3 buying ${ethers.formatUnits(user3BuyYes, 18)} YES tokens...`);
  await owlphaFactory.connect(user3).buyYes(conditionId, user3BuyYes, ethers.parseUnits("1000000", collateralDecimals));
  await logMarketState(owlphaFactory, conditionId, yesTokenId, noTokenId, collateralDecimals);

  // === Settlement (YES Wins) ===
  console.log("\nSettling market (YES wins)...");
  // Fast forward time
  console.log("Fast forwarding time past market end...");
  await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
  await ethers.provider.send("evm_mine");

  const winningOutcome = yesTokenId; 
  // Owner settles the market
  console.log(`Owner (${owner.address.substring(0,6)}...) settling market with winning outcome: YES (${winningOutcome})`); 
  const settleTx = await owlphaFactory.connect(owner).settleMarket(conditionId, winningOutcome);
  await settleTx.wait(); 
  console.log("Market settled.");

  // Verify settlement state
  const isSettled = await owlphaFactory.marketSettled(conditionId);
  const actualWinningTokenId = await owlphaFactory.winningTokenId(conditionId);
  if (isSettled && actualWinningTokenId === winningOutcome) {
    console.log("Settlement state verified successfully.");
  } else {
    console.error("Settlement state verification failed!");
    process.exitCode = 1; return;
  }

  // === Post-Settlement State ===
  console.log("\nChecking post-settlement market state...");
  await logMarketState(owlphaFactory, conditionId, yesTokenId, noTokenId, collateralDecimals, true);

  // === Redemption ===
  console.log("\nSimulating redemption...");
  await redeemAndLog(owlphaFactory, collateralToken, user1, conditionId, "User1 (YES Buyer)", collateralDecimals);
  await redeemAndLog(owlphaFactory, collateralToken, user3, conditionId, "User3 (YES Buyer)", collateralDecimals);
  await redeemAndLog(owlphaFactory, collateralToken, marketCreator, conditionId, "marketCreator (LP)", collateralDecimals); 

  // User2 (bought NO) attempts to redeem losing tokens
  const user2LosingBalance = await owlphaFactory.balanceOf(user2.address, noTokenId);
  const user2WinningBalance = await owlphaFactory.balanceOf(user2.address, yesTokenId);

  console.log(`\nUser2 attempting to redeem...`);
  console.log(`  User2 Losing (NO) Token Balance: ${ethers.formatUnits(user2LosingBalance, 18)}`);
  console.log(`  User2 Winning (YES) Token Balance: ${ethers.formatUnits(user2WinningBalance, 18)}`);
  if (user2LosingBalance > 0 && user2WinningBalance == 0) {
      try {
        await owlphaFactory.connect(user2).redeemPosition(conditionId);
        console.error("Error: User2 redemption did not revert as expected.");
        process.exitCode = 1;
      } catch (error) {
        if (error.message.includes("No winning tokens to redeem")) {
          console.log("User2 redemption call correctly reverted with 'No winning tokens to redeem'.");
        } else {
          console.error("User2 redemption reverted with unexpected error:", error.message);
          process.exitCode = 1;
        }
      }
  } else if (user2WinningBalance > 0) {
       console.log("User2 holds some winning tokens, attempting redemption...");
       await redeemAndLog(owlphaFactory, collateralToken, user2, conditionId, "User2 (Mixed Holder)", collateralDecimals);
  } else {
      console.log("User2 has no tokens to redeem.");
  }

  // === PNL Calculation ===
  console.log("\n--- Calculating PNL (Traders Only) --- ");
  const finalCollateralBalances = {};
  for (const name in traders) {
      finalCollateralBalances[name] = await collateralToken.balanceOf(traders[name].address);
      const pnl = finalCollateralBalances[name] - initialCollateralBalances[name];
      console.log(`  ${name}:`);
      console.log(`    Initial Collateral: ${ethers.formatUnits(initialCollateralBalances[name], collateralDecimals)}`);
      console.log(`    Final Collateral:   ${ethers.formatUnits(finalCollateralBalances[name], collateralDecimals)}`);
      console.log(`    PNL:                ${ethers.formatUnits(pnl, collateralDecimals)}`);
  }
  const ownerFinalBalance = await collateralToken.balanceOf(owner.address);
  const marketCreatorFinalBalance = await collateralToken.balanceOf(marketCreator.address);
  console.log(`\n  --- Other Balances (Info) ---`); 
  console.log(`  Owner Final Balance:           ${ethers.formatUnits(ownerFinalBalance, collateralDecimals)}`); 
  console.log(`  marketCreator Final Balance:   ${ethers.formatUnits(marketCreatorFinalBalance, collateralDecimals)}`); 


  console.log("\n--- Simulation Complete ---");
}

// Helper function to log market state
async function logMarketState(factory, conditionId, yesId, noId, collateralDecimals, settled = false) {
  const reserveRaw = await factory.marketReserve(conditionId);
  const yesSupply = await factory["totalSupply(uint256)"](yesId);
  const noSupply = await factory["totalSupply(uint256)"](noId);
  const yesPrice = await factory.getMarketPrice(conditionId, yesId);
  const noPrice = await factory.getMarketPrice(conditionId, noId);

  console.log(`  Market Reserve: ${ethers.formatUnits(reserveRaw, collateralDecimals)} collateral`);
  console.log(`  YES Supply: ${ethers.formatUnits(yesSupply, 18)}`);
  console.log(`  NO Supply: ${ethers.formatUnits(noSupply, 18)}`);
  console.log(`  YES Price: ${ethers.formatUnits(yesPrice, 18)} (collateral/token)`);
  console.log(`  NO Price: ${ethers.formatUnits(noPrice, 18)} (collateral/token)`);
  if (settled) {
      const winningId = await factory.winningTokenId(conditionId);
      console.log(`  Settled: YES, Winning Token ID: ${winningId} (${winningId == yesId ? 'YES' : 'NO'})`);
  }
}

// Helper function to redeem and log
async function redeemAndLog(factory, collateralToken, user, conditionId, userName, collateralDecimals) {
    const winningTokenId = await factory.winningTokenId(conditionId);
    const initialBalance = await factory.balanceOf(user.address, winningTokenId);
    const initialCollateralUser = await collateralToken.balanceOf(user.address);
    const initialCollateralFactory = await collateralToken.balanceOf(factory.target);
    console.log(`\n${userName} redeeming ${ethers.formatUnits(initialBalance, 18)} winning tokens...`);
    console.log(`  (Factory collateral before: ${ethers.formatUnits(initialCollateralFactory, collateralDecimals)})`);
    if (initialBalance == 0n) {
        console.log(`${userName} has no winning tokens to redeem.`);
        return 0n;
    }
    let collateralChange = 0n;
    try {
        const redeemTx = await factory.connect(user).redeemPosition(conditionId);
        const receipt = await redeemTx.wait();
        const finalCollateralUser = await collateralToken.balanceOf(user.address);
        const finalCollateralFactory = await collateralToken.balanceOf(factory.target);
        collateralChange = finalCollateralUser - initialCollateralUser;
        console.log(`  (Factory collateral after: ${ethers.formatUnits(finalCollateralFactory, collateralDecimals)})`);
        console.log(`  Redeemed collateral: ${ethers.formatUnits(collateralChange, collateralDecimals)}`);
    } catch (e) {
        console.error(`${userName} redemption failed:`, e.message);
    }
    return collateralChange;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 

