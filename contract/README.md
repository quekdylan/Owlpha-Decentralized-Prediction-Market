
# Owlpha Smart Contracts

  

This package contains the solidity contracts, deployment scripts, and tests for the Owlpha prediction market.

  

## Directory Walkthrough

  

-  `contracts/OwlphaFactory.sol` core ERC1155 factory that mints yes/no outcome tokens, manages liquidity, and settles markets.

-  `contracts/PythagoreanBondingCurve.sol` decimal-scaling library used by the factory when converting collateral amounts to 18-decimal ERC1155 balances and back.

-  `contracts/test/TestCollateralToken.sol`  lightweight ERC20 used in tests and simulation scripts to emulate collateral assets.

-  `scripts/deploy.js`  deploys the bonding-curve library and `OwlphaFactory`, logging addresses.

-  `scripts/marketLifecycle.js`  spins up a local market lifecycle simulation (LP creation, trading, settlement, redemption) and prints state transitions.

-  `scripts/precisionLossDemo.js`  explores rounding behaviour with low-decimal collateral by minting, burning, and redeeming tiny positions.

-  `test/OwlphaFactory.js`  comprehensive unit tests covering market creation, trading guards, settlement, and redemption logic.

-  `hardhat.config.js`  Hardhat setup with Solidity 0.8.20/0.8.22 compilers.

  

## Quick Start

  

1. Install dependencies:

```bash

npm install

```

2. Compile contracts:

```bash

npx hardhat compile

```

3. Run tests (PowerShell users may need to temporarily enable script execution with `Set-ExecutionPolicy -Scope Process Bypass`):

```bash

npx hardhat test

```

  

## Local Development Tips

  

- Launch an in-memory chain for manual interaction:

```bash

npx hardhat node

```

- Deploy to a local or configured network:

```bash

npx hardhat run scripts/deploy.js --network <network>

```

- To observe end-to-end behaviour, run the lifecycle simulator:

```bash

npx hardhat run scripts/marketLifecycle.js

```

- To inspect rounding effects with low-decimal collateral, run the precision demo:

```bash

npx hardhat run scripts/precisionLossDemo.js

```

  

## Notes

  

- Set the ERC1155 metadata base URI inside `scripts/deploy.js` before mainnet deployment so that `OwlphaFactory.uri(tokenId)` resolves to your hosted JSON metadata.

- The factory currently uses decimal scaling only; if you plan to introduce dynamic pricing, replace the helper conversions in `PythagoreanBondingCurve.sol` with the desired bonding-curve math.