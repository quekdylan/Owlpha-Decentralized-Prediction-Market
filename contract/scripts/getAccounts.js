const hre = require("hardhat");

async function main() {
  console.log("🔑 Test Account Information for MetaMask:");
  console.log("==========================================");
  
  const accounts = await hre.ethers.getSigners();
  
  // The first account is usually the deployer
  const deployer = accounts[0];
  console.log("👤 Deployer Account (has 10,000 USDC):");
  console.log(`   Address: ${deployer.address}`);
  
  // Get balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`   ETH Balance: ${hre.ethers.formatEther(balance)} ETH`);
  
  console.log("\n📋 MetaMask Import Instructions:");
  console.log("1. Open MetaMask");
  console.log("2. Click your account icon → Import Account");
  console.log("3. Select 'Private Key' option");
  console.log("4. Use this private key:");
  console.log("   ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  console.log("\n⚠️  WARNING: This is a test private key from Hardhat's default accounts.");
  console.log("   NEVER use this for mainnet or real funds!");
  
  console.log("\n🌐 Network Settings for MetaMask:");
  console.log("   Network Name: Hardhat Local");
  console.log("   RPC URL: http://127.0.0.1:8545");
  console.log("   Chain ID: 31337");
  console.log("   Currency: ETH");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});