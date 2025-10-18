import { ethers } from 'ethers';

// Extend Window interface for ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}

// This will be replaced with actual deployed address
export const OWLPHA_FACTORY_ADDRESS = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0'; // Updated with deployed address

// Set this to the block where OwlphaFactory was deployed
// For local development (Hardhat node), use 0
// For production, set to actual deployment block to speed up queries
export const FACTORY_DEPLOYMENT_BLOCK = 0;

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
export const MOCK_USDC_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'; // Updated with deployed address

// Get markets from blockchain
export async function getBlockchainMarkets() {
  try {
    if (typeof window.ethereum === 'undefined') {
      console.log('No MetaMask detected, returning empty markets');
      return []; // Return empty array if no web3
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(OWLPHA_FACTORY_ADDRESS, OWLPHA_FACTORY_ABI, provider);
    
    // Check if we're on the right network (Hardhat local = chainId 31337)
    const network = await provider.getNetwork();
    console.log('Connected to network:', network);
    
    // Query for market creation events from deployment block to latest
    console.log(`Scanning for markets from block ${FACTORY_DEPLOYMENT_BLOCK} to latest...`);
    const filter = contract.filters.Owlpha_MarketCreated();
    const events = await contract.queryFilter(filter, FACTORY_DEPLOYMENT_BLOCK, 'latest');
    
    console.log(`Found ${events.length} markets on blockchain`);
    
    if (events.length === 0) {
      console.log('No markets found on blockchain');
      return [];
    }
    
    // Process each market with delays to prevent circuit breaker
    const markets = [];
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      try {
        console.log(`Processing market ${i + 1}/${events.length}...`);
        const { conditionId, question, endTime, yesTokenId, noTokenId } = (event as any).args;
        
        // Get additional market data with small delay
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between markets
        
        let settled, reserve, supplies;
        try {
          console.log(`  Fetching market data for ${conditionId}...`);
          [settled, reserve, supplies] = await Promise.all([
            contract.marketSettled(conditionId).catch(err => {
              console.warn(`    ⚠️ marketSettled failed:`, err instanceof Error ? err.message : String(err));
              return false; // Default to not settled
            }),
            contract.marketReserve(conditionId).catch(err => {
              console.warn(`    ⚠️ marketReserve failed:`, err instanceof Error ? err.message : String(err));
              return 0; // Default to 0 reserve
            }),
            contract.marketSupplies(conditionId).catch(err => {
              console.warn(`    ⚠️ marketSupplies failed:`, err instanceof Error ? err.message : String(err));
              return { sYes: ethers.parseUnits('0', 18), sNo: ethers.parseUnits('0', 18) }; // Default to 0 supply
            })
          ]);
        } catch (err) {
          console.error(`    ❌ Failed to fetch market data:`, err instanceof Error ? err.message : String(err));
          // Use defaults
          settled = false;
          reserve = 0;
          supplies = { sYes: ethers.parseUnits('0', 18), sNo: ethers.parseUnits('0', 18) };
        }
        
        // Calculate prices (simplified - not using Pythagorean curve yet)
        const totalSupply = supplies.sYes + supplies.sNo;
        const hundred = ethers.parseUnits('100', 0);
        const yesPrice = totalSupply > 0 ? Number(supplies.sYes * hundred / totalSupply) / 100 : 0.5;
        const noPrice = totalSupply > 0 ? Number(supplies.sNo * hundred / totalSupply) / 100 : 0.5;
        
        const market = {
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
        
        markets.push(market);
        console.log(`✅ Market processed: "${question}"`);
        
      } catch (err) {
        console.error(`❌ Error processing market ${i + 1}:`, err);
        // Continue processing other markets
      }
    }
    
    console.log(`Successfully loaded ${markets.length} markets from blockchain`);
    return markets;
    
  } catch (error) {
    console.error('Error fetching blockchain markets:', error);
    return [];
  }
}

// Fetch a single market by conditionId
export async function getBlockchainMarketById(conditionId: string) {
  try {
    if (typeof window.ethereum === 'undefined') {
      return null;
    }
    const provider = new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(OWLPHA_FACTORY_ADDRESS, OWLPHA_FACTORY_ABI, provider);

    // Read core fields
    const [question, endTime, settled, reserve, supplies] = await Promise.all([
      contract.marketQuestion(conditionId),
      contract.marketEndTime(conditionId),
      contract.marketSettled(conditionId),
      contract.marketReserve(conditionId),
      contract.marketSupplies(conditionId)
    ]);

    // Find creation event to get createdAt timestamp
    let createdAt: number | null = null;
    let creator: string | null = null;
    try {
      const filter = contract.filters.Owlpha_MarketCreated();
      const events = await contract.queryFilter(filter, FACTORY_DEPLOYMENT_BLOCK, 'latest');
      const iface = new ethers.Interface(OWLPHA_FACTORY_ABI);
      const match = events.find((e: any) => {
        try {
          const parsed = iface.parseLog(e);
          const id = parsed?.args?.[0];
          return String(id).toLowerCase() === String(conditionId).toLowerCase();
        } catch { return false; }
      });
      if (match?.blockNumber) {
        try {
          const parsed = iface.parseLog(match);
          if (parsed?.args?.[1]) creator = String(parsed.args[1]);
        } catch {}
        const block = await provider.getBlock(match.blockNumber);
        if (block?.timestamp) createdAt = Number(block.timestamp) * 1000;
      }
    } catch (e) {
      console.warn('Could not resolve market createdAt from events:', e);
    }

    const totalSupply = supplies.sYes + supplies.sNo;
    const hundred = ethers.parseUnits('100', 0);
    const yesPrice = totalSupply > 0 ? Number(supplies.sYes * hundred / totalSupply) / 100 : 0.5;
    const noPrice = totalSupply > 0 ? Number(supplies.sNo * hundred / totalSupply) / 100 : 0.5;

    return {
      id: conditionId,
      question: question as string,
      category: 'Blockchain',
      endTime: Number(endTime),
      yesPrice,
      noPrice,
      volumeUSDC: Number(ethers.formatUnits(reserve, 6)),
      settled: Boolean(settled),
      imageUrl: '/placeholder/blockchain.png',
      createdAt,
      creator
    };
  } catch (error) {
    console.error('Error fetching market by id:', error);
    return null;
  }
}

export async function connectWallet() {
  if (typeof window.ethereum !== 'undefined') {
    try {
      // Step 1: Request account access (most important)
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      // Step 2: Create provider and get basic info (with delay to avoid circuit breaker)
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      
      console.log('🔗 Wallet Connected:');
      console.log('📍 Address:', address);
      
      // Step 3: Get additional info with delay to prevent circuit breaker
      try {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
        const balance = await provider.getBalance(address);
        console.log('💰 ETH Balance:', ethers.formatEther(balance), 'ETH');
        
        await new Promise(resolve => setTimeout(resolve, 500)); // Another 500ms delay
        const network = await provider.getNetwork();
        console.log('🌐 Network:', network);
      } catch (infoError) {
        console.warn('Could not fetch wallet info:', infoError);
        // Don't fail the connection if we can't get balance/network info
      }
      
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

    // Try to extract conditionId from logs
    let conditionId: string | null = null;
    try {
      const iface = new ethers.Interface(OWLPHA_FACTORY_ABI);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === 'Owlpha_MarketCreated') {
            // event Owlpha_MarketCreated(bytes32 indexed conditionId, ...)
            conditionId = parsed.args[0] as string;
            break;
          }
        } catch (_) {}
      }
    } catch (e) {
      console.warn('Could not parse conditionId from logs:', e);
    }

    return { receipt, conditionId } as const;
  } catch (error) {
    console.error('Error creating market:', error);
    throw error;
  }
}