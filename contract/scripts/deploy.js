const hre = require("hardhat");

async function main() {
  console.log("Deploying contracts...");

  // First, deploy the PythagoreanBondingCurve library
  console.log("Deploying PythagoreanBondingCurve library...");
  const PythagoreanBondingCurve = await hre.ethers.deployContract("PythagoreanBondingCurve");
  await PythagoreanBondingCurve.waitForDeployment();
  console.log(`PythagoreanBondingCurve deployed to: ${PythagoreanBondingCurve.target}`);

  // Base URI for ERC1155 token metadata
  const baseURI = "https://api.owlpha-protocol.io/metadata/";

  // Deploy OwlphaFactory contract with the library link
  console.log("Deploying OwlphaFactory contract...");
  const OwlphaFactory = await hre.ethers.deployContract("OwlphaFactory", [baseURI], {
    libraries: {
      PythagoreanBondingCurve: PythagoreanBondingCurve.target
    }
  });
  
  await OwlphaFactory.waitForDeployment();

  console.log(`OwlphaFactory deployed to: ${OwlphaFactory.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
