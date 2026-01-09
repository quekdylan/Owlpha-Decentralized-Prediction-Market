# 🦉 Owlpha - Decentralized Prediction Markets

A full-stack decentralized prediction market platform built with Next.js and Solidity, featuring automated market making using Pythagorean bonding curves.

## 🚀 Quick Start

This guide will help you set up the entire project locally in ~15 minutes.

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Git** - [Download here](https://git-scm.com/)
- **MetaMask Browser Extension** - [Install here](https://metamask.io/)
- **Google Gemini API Key** - [Get here](https://makersuite.google.com/app/apikey) (for LLM market validation)

## 🔧 Installation & Setup

### Step 1: Clone & Install Dependencies

```bash
# Clone the repository
git clone <your-repo-url>
cd Owlpha-Decentralized-Prediction-Market

# Install contract dependencies
cd contract
npm install

# Install frontend dependencies
cd ../web
npm install
```

### Step 2: Start Local Blockchain

Open a **new terminal** and run:

```bash
cd contract
npx hardhat node
```

✅ **Success indicator:** You should see "Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545"

⚠️ **Keep this terminal running** - this is your local blockchain!

### Step 3: Deploy Smart Contracts

Open **another terminal** and run:

```bash
cd contract
npx hardhat run scripts/quickDeploy.js --network localhost
```

✅ **Success indicator:** You should see output like:
```
✅ OwlphaFactory deployed to: 0x0165878A594ca255338adfa4d48449f69242Eb8F
✅ Mock USDC deployed to: 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
```

📝 **Important:** Copy these addresses - you'll need them if they're different!

### Step 4: Update Contract Addresses (If Needed)

If your deployed addresses are different from the ones shown above, update them:

1. Open `web/src/lib/blockchain.ts`
2. Update these lines with your addresses:
```typescript
export const OWLPHA_FACTORY_ADDRESS = 'YOUR_FACTORY_ADDRESS';
export const MOCK_USDC_ADDRESS = 'YOUR_USDC_ADDRESS';
```

### Step 4.5: Setup Environment Variables

1. Create `web/.env.local` file:
```bash
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
```

2. Get your Gemini API key:
   - Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Copy it to your `.env.local` file

⚠️ **Important:** Never commit `.env.local` to git - it's already in `.gitignore`

### Step 5: Start Frontend

```bash
cd web
npm run dev
```

✅ **Success indicator:** Frontend running at http://localhost:3000

### Step 6: Setup MetaMask

#### 6.1 Add Local Network
1. Open MetaMask extension
2. Click network dropdown → "Add network" → "Add a network manually"
3. Fill in:
   ```
   Network Name: Hardhat Local
   New RPC URL: http://127.0.0.1:8545
   Chain ID: 31337
   Currency Symbol: ETH
   ```
4. Click "Save" and switch to "Hardhat Local"

#### 6.2 Import Test Account
1. In MetaMask: Click account icon → "Import Account"
2. Select "Private Key"
3. Paste this test private key:
   ```
   ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```
4. Click "Import"

✅ **Success indicator:** You should see ~10,000 ETH in your MetaMask wallet

## 🎉 Test Your Setup

1. Go to http://localhost:3000
2. **Connect your wallet** (MetaMask should auto-connect if previously authorized)
3. Click "Create Market"
4. Fill out the form:
   Example
   - Question: "Will Bitcoin reach $100,000 by end of 2025?"
   - Expire date & time: Set a future date
   - Initial Liquidity: 10 USDC
5. **Wait for AI validation** (Gemini will analyze your question)
6. If validation passes, click "Accept & Continue"
7. Approve transactions in MetaMask
8. Your market should appear on the homepage!
9. Click on your market to view the detailed event page

## 🛠️ Development Scripts

### Contract Commands
```bash
cd contract

# Start local blockchain
npx hardhat node

# Deploy contracts
npx hardhat run scripts/quickDeploy.js --network localhost

# Run tests
npx hardhat test

# Get account info
npx hardhat run scripts/getAccounts.js --network localhost

# Send test ETH to address
npx hardhat run scripts/sendEth.js --network localhost
```

### Frontend Commands
```bash
cd web

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

## 🏗️ Project Structure

```
Owlpha-Decentralized-Prediction-Market/
├── contract/                 # Smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── OwlphaFactory.sol          # Main prediction market contract
│   │   ├── PythagoreanBondingCurve.sol # AMM pricing library
│   │   └── test/TestCollateralToken.sol # Mock USDC for testing
│   ├── scripts/              # Deployment & utility scripts
│   ├── test/                 # Contract tests
│   └── hardhat.config.js     # Hardhat configuration
└── web/                      # Frontend (Next.js)
    ├── src/
    │   ├── app/              # Next.js app router pages
    │   ├── components/       # React components
    │   └── lib/              # Utility libraries
    │       ├── blockchain.ts # Web3 integration
    │       └── markets.ts    # Market data handling
    └── package.json          # Frontend dependencies
```

## 🔗 Key Features

- **Create Prediction Markets** - Anyone can create binary (YES/NO) prediction markets
- **Automated Market Making** - Uses Pythagorean bonding curves for pricing
- **MetaMask Integration** - Connect wallet to trade and create markets
- **Real-time Updates** - Markets update automatically from blockchain
- **Test Environment** - Complete local setup with mock USDC
- **AI-Powered Validation** - Gemini LLM validates market questions for objectivity
- **On-chain Settlement Notes** - LLM analysis stored as blockchain events
- **Individual Market Pages** - Detailed event pages with trading interface

## 💡 Understanding the System

### Smart Contracts
- **OwlphaFactory**: Main contract for creating and managing prediction markets
- **PythagoreanBondingCurve**: Mathematical library for automatic pricing
- **TestCollateralToken**: Mock USDC token for testing

### How It Works
1. **Market Creation**: Users deposit collateral to create prediction markets
2. **Trading**: Others can buy YES/NO shares at algorithmically determined prices
3. **Settlement**: Market creator resolves the outcome
4. **Redemption**: Winners redeem shares for collateral
5. **AI Validation**: Gemini analyzes questions for objectivity and verifiability
6. **Settlement Analysis**: LLM provides reasoning, sources, and criteria

## 🐛 Troubleshooting

### Common Issues

#### "MetaMask connection failed"
- Ensure MetaMask is installed and unlocked
- Check you're on "Hardhat Local" network
- Try refreshing the page

#### "Transaction failed" or "Insufficient gas"
- Make sure you imported the test account with ETH
- Check MetaMask is connected to localhost:8545
- Verify Hardhat node is still running

#### "Contract not found" errors
- Restart Hardhat node: `npx hardhat node`
- Redeploy contracts: `npx hardhat run scripts/quickDeploy.js --network localhost`
- Update contract addresses in `blockchain.ts`

#### "Gemini API error" or validation fails
- Check your `.env.local` file has `NEXT_PUBLIC_GEMINI_API_KEY`
- Verify the API key is valid at [Google AI Studio](https://makersuite.google.com/app/apikey)
- Try a different question format (be more specific with location, timeframe, etc.)

#### Frontend won't start
```bash
cd web
rm -rf .next node_modules
npm install
npm run dev
```

#### No markets showing
- Check browser console for errors
- Ensure MetaMask is connected
- Try creating a test market
- Check that Gemini API key is set up correctly

### Getting Help

1. **Check browser console** (F12) for error messages
2. **Check terminal outputs** for deployment/server errors
3. **Verify all steps** were completed in order
4. **Restart everything** if in doubt:
   ```bash
   # Stop all processes (Ctrl+C)
   # Then restart:
   cd contract && npx hardhat node
   # New terminal:
   cd contract && npx hardhat run scripts/quickDeploy.js --network localhost
   # New terminal:
   cd web && npm run dev
   ```

## 🚨 Security Notes

⚠️ **For Development Only:**
- The test private key is public - NEVER use for mainnet
- Mock USDC has unlimited minting - for testing only
- No access controls on market settlement - demo purposes


## 🤝 Contributions

Developed in collaboration with Kean Yee and Abdillah

## 📄 License

This project is licensed under the MIT License.

---

## Quick Command Reference

```bash
# Full setup from scratch:
git clone <repo> && cd Owlpha-Decentralized-Prediction-Market
cd contract && npm install && npx hardhat node &
npx hardhat run scripts/quickDeploy.js --network localhost
cd ../web && npm install && npm run dev

# Then setup MetaMask with network (31337) and test account
```

**Need help?** Check the troubleshooting section or open an issue!
