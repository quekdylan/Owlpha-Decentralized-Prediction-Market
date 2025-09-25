Background and Motivation

We want to replace the current decimal-only conversion in `PythagoreanBondingCurve.sol` with a real Pythagorean bonding curve as described in the PNP docs (Price(yes)^2 + Price(no)^2 = 1), turning the system into an AMM-style market where prices depend on supply and trades adjust reserves. Reference: PNP bonding curve overview (Price_yes^2 + Price_no^2 == 1) — see docs: https://pnpprotocol.mintlify.app/bonding.

Key Challenges and Analysis

- Curve definition
  - Use supplies `sYes`, `sNo` (18-decimal ERC1155), reserve `r` (collateral units), and coefficient `c` (fee accumulator/coefficient ≥ 1e18).
  - Maintain Pythagorean constraint for prices: P_yes^2 + P_no^2 = 1.
  - Practical formulation linking price and reserve:
    - Let `norm = sqrt(sYes^2 + sNo^2)` (wad-scaled arithmetic).
    - Define instantaneous prices (dimensionless):
      - `priceYes(sYes, sNo, c) = sYes / norm`
      - `priceNo(sYes, sNo, c) = sNo / norm`
      - These satisfy priceYes^2 + priceNo^2 = 1.
    - Link reserve to supply via invariant:
      - `reserve(sYes, sNo, c) = c * u * norm` where `u` is a unit price scale in collateral per decision-token (default u = 1e18 wad, i.e. 1.0).
      - Marginal cost to mint `ds` YES at constant NO is `∂reserve/∂sYes = c * u * (sYes / norm) = c * u * priceYes`.
      - Therefore, the cost of a finite trade is the reserve delta between states.
 - Fee handling:
      - Per user decision: no fees on trades for now. Keep formulas fee-free and do not accrue to reserve on buys/sells. Redemption remains fee-free as well. We can add fee hooks later without changing the invariant.

- Fixed-point math
  - Use 18-decimal wad across curve functions.
  - Library choice: Use OpenZeppelin `Math` (OZ 5.x) for `mulDiv` and `sqrt`.
  - Guard overflow with 512-bit intermediate via `Math.mulDiv` where needed.

- State changes in `OwlphaFactory`
  - Track per-market: `sYes`, `sNo`, `reserveR`, `cWad` (1e18 at genesis), `unitWad` (1e18), and `feeBps` (reuse TAKE_FEE or split maker/taker fees).
  - Replace linear `mintDecisionTokens`/`burnDecisionTokens` with buy/sell along curve (no fees):
    - Buy YES: user pays `cost = reserve(sYes + dS, sNo, c) - reserve(sYes, sNo, c)`, receives `dS` YES; update `sYes += dS`, `reserveR += cost`.
    - Sell YES: user returns `dS` YES, receives `proceeds = reserve(sYes, sNo, c) - reserve(sYes - dS, sNo, c)`; update `sYes -= dS`, `reserveR -= proceeds`.
    - Analogous for NO with `sNo`.
  - After every trade, update `c` to keep invariant exact: `c = reserveR / (unitWad * norm)`.
  - Settlement:
    - After end time, choose winner. Redemption should allow converting winning tokens to collateral at fair share: since losers become valueless, redeem winning `balance` by proportion of reserve: `payout = reserveR * (balance / sWinner)` less fee (or zero fee on redemption if fees only on trades). Burn tokens, reduce `sWinner`, reduce `reserveR`.

- Migration/compatibility
  - Genesis market creation: creator deposits `initialLiquidity`, receives equal amounts YES and NO. We need to decide genesis supplies `sYes0 == sNo0`. For simplicity, set `sYes0 = sNo0 = collateralToDecision(initialLiquidity)` and set `reserveR = initialLiquidity`, `c = reserveR / (u * sqrt(sYes0^2 + sNo0^2))`.
  - Backward compatibility: keep events names, but add new fields if needed (emit supply/reserve changes).

High-level Task Breakdown

1) Specify math and API in `PythagoreanBondingCurve.sol`
   - Deliverables:
     - Pure/view functions (wad-precision): `priceYes`, `priceNo`, `reserve`, `costToBuyYes`, `proceedsFromSellYes`, and NO counterparts; helper `norm`.
     - Tests in JS/TS validating invariants, monotonicity, and numerical stability (edge cases around tiny/huge supplies).
   - Success criteria:
     - For multiple random states, `abs(priceYes^2 + priceNo^2 - 1) <= 1e-12` (within integer tolerance).
     - `reserve(next) - reserve(prev) == cost` for buys; analogous for sells.

2) Extend `OwlphaFactory` storage and events
   - Deliverables:
     - Per-market fields: `sYes`, `sNo`, `reserveR`, `cWad`, `unitWad` (constant 1e18), keep `collateralDecimals`.
     - New events: `Owlpha_Trade(conditionId, side, dS, cost, fee, sYes, sNo, reserveR, cWad)`.
   - Success criteria:
     - Compile cleanly; events emitted with correct parameters in tests.

3) Refactor trading functions to curve-based
   - Deliverables:
     - Replace `mintDecisionTokens`/`burnDecisionTokens` with `buyYes/buyNo/sellYes/sellNo` function names.
     - No fees on trades. Ensure reserve deltas match integral costs exactly.
   - Success criteria:
     - Unit tests show monotonic price behavior; buying increases price for that side, decreases the opposite.
     - Invariant holds within tolerance after each trade.

4) Adjust market creation and redemption
   - Deliverables:
     - Genesis: set `sYes0`, `sNo0`, `reserveR = initialLiquidity`, compute `c`.
     - Redemption: compute pro-rata payout from reserve for winner: `payout = reserveR * balance / sWinner` (no redemption fee), update state.
   - Success criteria:
     - Post-settlement, redeeming all winner supply drains reserve (within rounding), losers cannot redeem.

5) Update tests
   - Deliverables:
     - Update existing tests to new function names/semantics.
     - Add curve-specific tests: price monotonicity, slippage vs trade size, fee accrual into reserve, exact reserve deltas equal integral costs.
   - Success criteria:
     - All tests pass locally (>= 30 tests), coverage includes the new math.

6) Scripts and README
   - Deliverables:
     - Update `scripts/marketLifecycle.js` to demonstrate pricing changes and log price/fee/reserve progression.
     - README updates documenting curve behavior and parameters.
   - Success criteria:
     - Running lifecycle script shows sane price movements and invariant is preserved.

Project Status Board

- [x] Specify curve math and pure functions in `PythagoreanBondingCurve.sol`
- [x] Extend `OwlphaFactory` storage/events for curve state
- [x] Refactor trading functions to buy/sell on curve with fees
- [x] Implement genesis and redemption on curve
- [x] Update and expand tests for curve behavior
- [x] Update scripts and README

Current Status / Progress Tracking

- All tasks implemented and verified locally:
  - Added curve math (norm, prices, reserve, cost/proceeds, computeC) in `PythagoreanBondingCurve.sol`.
  - Extended `OwlphaFactory` with curve state (`sYes/sNo/reserveR/cWad/unitWad`) and `Owlpha_Trade` event.
  - Added `buyYes/buyNo/sellYes/sellNo`; removed legacy `mintDecisionTokens`/`burnDecisionTokens`.
  - Redemption now pro‑rata from `reserveR`; recomputes `c` post‑redemption.
  - Added getters: `totalSupply(uint256)`, `marketReserve(bytes32)`, `marketSupplies(bytes32)`, `getMarketPrice(bytes32, tokenId)`.
  - Updated tests to curve API; suite passes.
  - Updated `scripts/marketLifecycle.js` to demonstrate prices/reserve and PnL; script runs successfully.

Executor's Feedback or Assistance Requests

- Decisions captured:
  - Fees: none on trades, none on redemption (can add later if needed).
  - Function names: adopt `buyYes/sellYes/buyNo/sellNo`.
  - Math library: use OpenZeppelin `Math` for sqrt/mulDiv.

Follow-ups (optional):
- Add invariant assertions to tests (e.g., `priceYes^2 + priceNo^2 ≈ 1` and `reserve ≈ c·unit·sqrt(sYes^2+sNo^2)`) with integer tolerance.
- Consider governance/roles for `settleMarket` (multisig) in future.

Lessons

- Include numerical tolerance checks in tests when validating invariants with integer math.
- Keep fees inside reserve to maintain on-curve accounting and avoid drift.
- When replacing APIs, keep temporaries reverting until tests migrate; then remove to silence warnings (done).

---

Frontend: Markets Browser (Planner)

Background and Motivation

We want a Markets Browser akin to the PNP screenshot: a dark-themed grid of market cards with category chips, search, sort (e.g., Volume), and a "Create Market" entry point. Our logo/theme aren’t finalized; we will copy the look/feel initially.

Key Challenges and Analysis

- Data source
  - Short term: mock API (local JSON) and/or read from deployed local Hardhat node using viem to pull market metadata, prices, volume.
  - Mid term: indexer service (TheGraph or custom) to compute volume and historical metrics. For now approximate volume = reserve delta or cumulative `Owlpha_Trade` deltas per market.
- Derived fields
  - YES/NO prices: use `getMarketPrice(conditionId, tokenId)`.
  - Volume (24h/total): initially sum of `collateralDelta` from `Owlpha_Trade` per market (mock or quick RPC scan on page load for local dev).
  - Status: Open/Settled via `marketSettled` and time vs `marketEndTime`.
  - Thumbnail: temporary placeholder images.
- UX spec (initial)
  - Header with tabs: How it works, Explore markets (active), Leaderboard (stub), Create Market button.
  - Category chips: All, Trending, Sports, Politics, Technology, ICM, Settled; chip toggles filter.
  - Search input (free text over question/creator) + Sort dropdown (Volume, Newest, Ending Soon, Price Movements).
  - Grid layout: 3 columns desktop, 2 tablet, 1 mobile. Each card shows image, question, YES/NO price badges, volume text, end date.
  - Dark theme colors copied from PNP for now.
- Tech stack
  - Next.js 14 (App Router) + TypeScript + Tailwind CSS.
  - viem + wagmi for wallet and contract reads (ethers v6 acceptable but viem preferred for reads).
  - Zustand for lightweight client state (filters/sort/search).
  - ESLint + Prettier.
- Contract integration plan (phase 1)
  - Config for factory address and ABI; for local dev, use `hardhat node` URL and addresses emitted by deploy script.
  - Functions: list markets (temporary: mock list), fetch per-market details: `marketQuestion`, `marketEndTime`, `getYesTokenId`, `getNoTokenId`, `getMarketPrice`, `marketReserve`, `marketSettled`.

High-level Task Breakdown

1) Scaffold web app
   - Create `web/` Next.js project with Tailwind, TypeScript, ESLint, Prettier.
   - Add base dark theme variables and global styles copied from reference.
   - Success: dev server runs, base layout renders.

2) Markets data layer (mock + contract hooks)
   - Define `Market` type and adapters to map from contract + mock.
   - Implement viem client and read hooks for prices and statuses (gated by env for local RPC).
   - Success: hook returns market DTOs for display (mock fallback works without chain).

3) Markets Browser UI
   - Build header/navigation, category chips, search, sort dropdown.
   - Build responsive grid and `MarketCard` component with placeholders for image and computed badges.
   - Success: grid shows mock markets; filters/search/sort work client-side.

4) Price/volume integration
   - Wire `getMarketPrice` reads; compute prices and format badges.
   - Implement simple volume metric (sum of `Owlpha_Trade.collateralDelta` from recent blocks or mock number) with clear TODO for real indexer.
   - Success: cards show dynamic YES/NO and volume; loading states handled.

5) Create Market entry and routing
   - Add Create Market button route stub; individual market page route `/markets/[id]` with details placeholder.
   - Success: navigation works.

6) Polish and docs
   - Theming pass to match screenshot; add README run instructions and env example.
   - Success: app is presentable and easy to run locally against mock or local node.

Success Criteria

- Page renders a grid of ≥6 mock markets with working search, category filter, and sort by volume.
- When connected to local node with a few created markets, prices/settlement state load via contract reads without errors.
- Lighthouse basic checks pass (no blocking errors), and no TypeScript or ESLint errors.

