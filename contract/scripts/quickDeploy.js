const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying contracts for frontend integration...");

  // Deploy TestCollateralToken (Mock USDC)
  console.log("📋 Deploying Mock USDC...");
  const TestCollateralToken = await hre.ethers.deployContract("TestCollateralToken", ["USD Coin", "USDC", 6]);
  await TestCollateralToken.waitForDeployment();
  console.log(`✅ Mock USDC deployed to: ${TestCollateralToken.target}`);

  // Deploy PythagoreanBondingCurve library
  console.log("📐 Deploying PythagoreanBondingCurve library...");
  const PythagoreanBondingCurve = await hre.ethers.deployContract("PythagoreanBondingCurve");
  await PythagoreanBondingCurve.waitForDeployment();
  console.log(`✅ PythagoreanBondingCurve deployed to: ${PythagoreanBondingCurve.target}`);

  // Deploy OwlphaFactory
  console.log("🏭 Deploying OwlphaFactory...");
  const baseURI = "https://api.owlpha-protocol.io/metadata/";
  const OwlphaFactory = await hre.ethers.deployContract("OwlphaFactory", [baseURI], {
    libraries: {
      PythagoreanBondingCurve: PythagoreanBondingCurve.target
    }
  });
  await OwlphaFactory.waitForDeployment();
  console.log(`✅ OwlphaFactory deployed to: ${OwlphaFactory.target}`);

  // Mint some USDC for testing
  const [deployer] = await hre.ethers.getSigners();
  const mintAmount = hre.ethers.parseUnits("10000", 6); // 10,000 USDC
  await TestCollateralToken.mint(deployer.address, mintAmount);
  console.log(`💰 Minted 10,000 USDC to ${deployer.address}`);

  console.log("\n🎉 Deployment Complete!");
  console.log("📝 Update your frontend with these addresses:");
  console.log(`   OWLPHA_FACTORY_ADDRESS = "${OwlphaFactory.target}"`);
  console.log(`   MOCK_USDC_ADDRESS = "${TestCollateralToken.target}"`);
  console.log("\n🔧 Next steps:");
  console.log("   1. Update /web/src/lib/blockchain.ts with the addresses above");
  console.log("   2. Start your frontend: cd ../web && npm run dev");
  console.log("   3. Connect MetaMask to localhost:8545");
  console.log("   4. Import the deployer private key to MetaMask for testing");
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});