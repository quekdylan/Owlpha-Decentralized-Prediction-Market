const hre = require("hardhat");

async function main() {
  console.log("💰 Sending test ETH to your MetaMask wallet...");
  
  // Get the deployer account (has lots of ETH)
  const [deployer] = await hre.ethers.getSigners();
  
  // Your MetaMask address (the one you imported)
  const yourAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  
  console.log(`🏦 Deployer balance: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`👤 Your balance before: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(yourAddress))} ETH`);
  
  // Send 1000 ETH to your address for testing
  const tx = await deployer.sendTransaction({
    to: yourAddress,
    value: hre.ethers.parseEther("1000") // 1000 ETH should be plenty for testing
  });
  
  await tx.wait();
  
  console.log(`✅ Sent 1000 ETH to ${yourAddress}`);
  console.log(`👤 Your balance after: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(yourAddress))} ETH`);
  
  console.log("\n🎉 Success! You now have test ETH for gas fees.");
  console.log("💡 Refresh MetaMask to see your updated balance.");
}

main().catch((error) => {
  console.error("❌ Error sending ETH:", error);
  process.exitCode = 1;
});