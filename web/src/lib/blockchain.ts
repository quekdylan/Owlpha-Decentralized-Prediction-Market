import { ethers } from 'ethers';

// Extend Window interface for ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}

// This will be replaced with actual deployed address
export const OWLPHA_FACTORY_ADDRESS = '0x0165878A594ca255338adfa4d48449f69242Eb8F'; // Updated with deployed address

// Basic ABI for createPredictionMarket function
export const OWLPHA_FACTORY_ABI = [
  "function createPredictionMarket(uint256 initialLiquidity, address collateralToken, string calldata question, uint256 endTime) external returns (bytes32 conditionId)",
  "function getYesTokenId(bytes32 conditionId) external view returns (uint256)",
  "function getNoTokenId(bytes32 conditionId) external view returns (uint256)",
  "function marketEndTime(bytes32 conditionId) external view returns (uint256)",
  "function marketQuestion(bytes32 conditionId) external view returns (string)",
  "function marketSettled(bytes32 conditionId) external view returns (bool)",
  "function marketReserve(bytes32 conditionId) external view returns (uint256)",
  "function marketSupplies(bytes32 conditionId) external view returns (uint256 sYes, uint256 sNo)",
  "function getMarketPrice(bytes32 conditionId, uint256 tokenId) external view returns (uint256)",
  "event Owlpha_MarketCreated(bytes32 indexed conditionId, address indexed creator, uint256 yesTokenId, uint256 noTokenId, string question, uint256 endTime, address collateralToken)"
];

// USDC ABI for approval and minting
export const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)"
];

// Mock USDC address for testing (you'll need to deploy this)
export const MOCK_USDC_ADDRESS = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9'; // Updated with deployed address

// Get markets from blockchain
export async function getBlockchainMarkets() {
  try {
    if (typeof window.ethereum === 'undefined') {
      return []; // Return empty array if no web3
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(OWLPHA_FACTORY_ADDRESS, OWLPHA_FACTORY_ABI, provider);
    
    // Get all market creation events
    const filter = contract.filters.Owlpha_MarketCreated();
    const events = await contract.queryFilter(filter, 0, 'latest');
    
    console.log(`Found ${events.length} markets on blockchain`);
    
    const markets = await Promise.all(events.map(async (event: any) => {
      try {
        const { conditionId, question, endTime, yesTokenId, noTokenId } = event.args;
        
        // Get additional market data
        const [settled, reserve, supplies] = await Promise.all([
          contract.marketSettled(conditionId),
          contract.marketReserve(conditionId),
          contract.marketSupplies(conditionId)
        ]);
        
        // Calculate prices (simplified)
        const totalSupply = supplies.sYes + supplies.sNo;
        const hundred = ethers.parseUnits('100', 0);
        const yesPrice = totalSupply > 0 ? Number(supplies.sYes * hundred / totalSupply) / 100 : 0.5;
        const noPrice = totalSupply > 0 ? Number(supplies.sNo * hundred / totalSupply) / 100 : 0.5;
        
        return {
          id: conditionId,
          question: question,
          category: "Blockchain", // Default category
          endTime: Number(endTime),
          yesPrice: yesPrice,
          noPrice: noPrice,
          volumeUSDC: Number(ethers.formatUnits(reserve, 6)),
          settled: settled,
          imageUrl: "/placeholder/blockchain.png"
        };
      } catch (err) {
        console.error('Error processing market:', err);
        return null;
      }
    }));
    
    return markets.filter(m => m !== null);
  } catch (error) {
    console.error('Error fetching blockchain markets:', error);
    return [];
  }
}

export async function connectWallet() {
  if (typeof window.ethereum !== 'undefined') {
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const balance = await provider.getBalance(address);
      
      console.log('🔗 Wallet Connected:');
      console.log('📍 Address:', address);
      console.log('💰 ETH Balance:', ethers.formatEther(balance), 'ETH');
      console.log('🌐 Network:', await provider.getNetwork());
      
      return { provider, signer };
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    }
  } else {
    throw new Error('MetaMask is not installed');
  }
}

export async function createMarket(
  question: string,
  endTime: number,
  initialLiquidity: string // in USDC units
) {
  try {
    const { signer } = await connectWallet();
    const userAddress = await signer.getAddress();
    
    // Convert initialLiquidity to proper units (6 decimals for USDC)
    const liquidityInWei = ethers.parseUnits(initialLiquidity, 6);
    
    // Create contract instances
    const factoryContract = new ethers.Contract(OWLPHA_FACTORY_ADDRESS, OWLPHA_FACTORY_ABI, signer);
    const usdcContract = new ethers.Contract(MOCK_USDC_ADDRESS, USDC_ABI, signer);
    
    console.log('Checking USDC balance...');
    
    // Check user's USDC balance first
    let balance;
    try {
      balance = await usdcContract.balanceOf(userAddress);
      console.log(`USDC Balance: ${ethers.formatUnits(balance, 6)} USDC`);
    } catch (error) {
      console.log('Could not check USDC balance, assuming 0');
      balance = ethers.parseUnits('0', 6);
    }
    
    // If user doesn't have enough USDC, mint some for testing
    if (balance < liquidityInWei) {
      console.log('Insufficient USDC, offering to mint tokens for testing...');
      
      // Ask user if they want to mint USDC
      const shouldMint = confirm(`You need ${initialLiquidity} USDC but only have ${ethers.formatUnits(balance, 6)} USDC.\n\nWould you like to mint ${ethers.formatUnits(ethers.parseUnits('10000', 6), 6)} test USDC?`);
      
      if (shouldMint) {
        const mintAmount = ethers.parseUnits('10000', 6); // Mint 10,000 USDC for testing
        const mintTx = await usdcContract.mint(userAddress, mintAmount);
        await mintTx.wait();
        console.log('USDC minted successfully!');
      } else {
        throw new Error('Insufficient USDC balance to create market');
      }
    }
    
    // Check and approve USDC spending
    console.log('Checking USDC allowance...');
    const allowance = await usdcContract.allowance(userAddress, OWLPHA_FACTORY_ADDRESS);
    
    if (allowance < liquidityInWei) {
      console.log('Approving USDC spending...');
      // Approve a large amount to avoid repeated approvals
      const approveAmount = ethers.parseUnits('1000000', 6); // 1M USDC allowance
      const approveTx = await usdcContract.approve(OWLPHA_FACTORY_ADDRESS, approveAmount);
      await approveTx.wait();
      console.log('USDC approval confirmed!');
    }
    
    console.log('Creating prediction market...');
    
    // Now create the market
    const tx = await factoryContract.createPredictionMarket(
      liquidityInWei,
      MOCK_USDC_ADDRESS,
      question,
      endTime
    );
    
    console.log('Transaction submitted, waiting for confirmation...');
    const receipt = await tx.wait();
    console.log('Market created successfully:', receipt);
    return receipt;
  } catch (error) {
    console.error('Error creating market:', error);
    throw error;
  }
}