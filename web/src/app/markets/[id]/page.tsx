'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { listMockMarkets, type Market } from '@/lib/markets';
import {
  getBlockchainMarketById,
  connectWallet,
  loadMarketTradingState,
  getUserBalances,
  quoteBuy,
  quoteSell,
  executeTrade,
  type MarketTradingState,
  type UserMarketBalances,
  type BuyQuote,
  type SellQuote,
} from '@/lib/blockchain';
import WalletButton from '@/components/WalletButton';
import { formatUnits, parseUnits } from 'ethers';

export default function MarketPage() {
  const params = useParams();
  const router = useRouter();
  const marketId = params.id as string;
  
  const [isWalletConnected, setIsWalletConnected] = useState<boolean>(false);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Load settlement analysis saved at creation time (keyed by conditionId)
  const [savedAnalysis, setSavedAnalysis] = useState<any>(null);
  const [tradeSide, setTradeSide] = useState<'buy' | 'sell'>('buy');
  const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no'>('yes');
  const [amountInput, setAmountInput] = useState<string>('');
  const [marketState, setMarketState] = useState<MarketTradingState | null>(null);
  const [userBalances, setUserBalances] = useState<UserMarketBalances | null>(null);
  const [isTradePending, setIsTradePending] = useState<boolean>(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);
  const [analysisExpanded, setAnalysisExpanded] = useState<boolean>(false);

  // Load market data (on-chain first, fallback to mock)
  useEffect(() => {
    const loadMarket = async () => {
      try {
        setLoading(true);
        // Try on-chain market first
        const onChain = await getBlockchainMarketById(marketId);
        if (onChain) {
          setMarket(onChain as unknown as Market);
        } else {
          // Fallback to mock catalog (dev mode)
          const markets = await listMockMarkets();
          const foundMarket = markets.find(m => m.id === marketId);
          if (foundMarket) setMarket(foundMarket);
          else setError('Market not found');
        }
      } catch (err) {
        console.error('Error loading market:', err);
        setError('Failed to load market');
      } finally {
        setLoading(false);
      }
    };

    loadMarket();
  }, [marketId]);

  useEffect(() => {
    let cancelled = false;
    const fetchTradingState = async () => {
      try {
        const state = await loadMarketTradingState(marketId);
        if (!cancelled) {
          setMarketState(state);
        }
      } catch (err) {
        console.error('Failed to load trading state:', err);
        if (!cancelled) {
          setMarketState(null);
        }
      }
    };
    fetchTradingState();
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  useEffect(() => {
    let ignore = false;
    const fetchBalances = async () => {
      if (!marketState || !walletAddress) {
        if (!ignore) {
          setUserBalances(null);
        }
        return;
      }
      try {
        const balances = await getUserBalances(marketState, walletAddress);
        if (!ignore) {
          setUserBalances(balances);
        }
      } catch (err) {
        console.error('Failed to fetch user balances:', err);
        if (!ignore) {
          setUserBalances(null);
        }
      }
    };
    fetchBalances();
    return () => {
      ignore = true;
    };
  }, [marketState, walletAddress, isWalletConnected]);

  // Load settlement analysis from localStorage (client-side only)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(`settlement:${marketId}`);
        if (raw) setSavedAnalysis(JSON.parse(raw));
        else setSavedAnalysis(null);
      }
    } catch (_) {
      setSavedAnalysis(null);
    }
  }, [marketId]);

  useEffect(() => {
    setAnalysisExpanded(false);
  }, [savedAnalysis]);

  // Detect existing wallet connection so the header wallet button persists across pages
  useEffect(() => {
    const detectWallet = async () => {
      try {
        if (typeof window === 'undefined') return;
        const persisted = localStorage.getItem('walletConnected');
        const eth: any = (window as any).ethereum;
        if (persisted === '1' && eth && eth.request) {
          const accounts = await eth.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            setWalletAddress(accounts[0]);
            setIsWalletConnected(true);
          }
        }
      } catch (_) {}
    };
    detectWallet();
  }, []);

  // Handle wallet connection
  const handleWalletConnected = (address: string) => {
    setWalletAddress(address);
    setIsWalletConnected(true);
  };

  // Handle wallet disconnection
  const handleWalletDisconnect = () => {
    setWalletAddress("");
    setIsWalletConnected(false);
    setUserBalances(null);
  };

  const collateralDecimals = marketState?.collateralDecimals ?? 6;
  const isYesSelected = selectedOutcome === 'yes';

  const tradeQuote = useMemo<BuyQuote | SellQuote | null>(() => {
    if (!marketState || amountInput.trim() === '') {
      return null;
    }
    try {
      if (tradeSide === 'buy') {
        const collateralAmount = parseUnits(amountInput, collateralDecimals);
        if (collateralAmount <= BigInt(0)) {
          return null;
        }
        return quoteBuy(marketState, selectedOutcome, collateralAmount);
      }
      const tokenAmount = parseUnits(amountInput, 18);
      if (tokenAmount <= BigInt(0)) {
        return null;
      }
      return quoteSell(marketState, selectedOutcome, tokenAmount);
    } catch (_) {
      return null;
    }
  }, [amountInput, tradeSide, selectedOutcome, marketState, collateralDecimals]);

  const formatNumeric = (value: string | number, digits = 2) => {
    const num = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(num)) {
      return (0).toFixed(digits);
    }
    return num.toFixed(digits);
  };

  const usdcBalanceRaw = userBalances ? formatUnits(userBalances.usdc, collateralDecimals) : '0';
  const yesBalanceRaw = userBalances ? formatUnits(userBalances.yes, 18) : '0';
  const noBalanceRaw = userBalances ? formatUnits(userBalances.no, 18) : '0';

  const usdcBalanceDisplay = formatNumeric(usdcBalanceRaw, 2);
  const yesBalanceDisplay = formatNumeric(yesBalanceRaw, 4);
  const noBalanceDisplay = formatNumeric(noBalanceRaw, 4);

  const yesValueDisplay = market
    ? formatNumeric(Number(yesBalanceRaw) * market.yesPrice, 2)
    : formatNumeric(0, 2);
  const noValueDisplay = market
    ? formatNumeric(Number(noBalanceRaw) * market.noPrice, 2)
    : formatNumeric(0, 2);

  const mintedTokensRaw = tradeQuote
    ? formatUnits(
        tradeSide === 'buy'
          ? (tradeQuote as BuyQuote).tokens
          : (tradeQuote as SellQuote).tokens,
        18
      )
    : '0';
  const mintedTokensDisplay = formatNumeric(mintedTokensRaw, 4);

  const payoutRaw = tradeQuote
    ? tradeSide === 'buy'
      ? formatUnits((tradeQuote as BuyQuote).payout, collateralDecimals)
      : formatUnits((tradeQuote as SellQuote).proceeds, collateralDecimals)
    : '0';
  const payoutDisplay = formatNumeric(payoutRaw, 2);

  const balanceLabel =
    tradeSide === 'buy'
      ? `${usdcBalanceDisplay} USDC`
      : `${isYesSelected ? yesBalanceDisplay : noBalanceDisplay} ${isYesSelected ? 'YES' : 'NO'}`;

  const tradeSummary = `${tradeSide === 'buy' ? 'Buying' : 'Selling'} ${
    isYesSelected ? 'Yes' : 'No'
  } ${tradeSide === 'buy' ? 'shares' : 'tokens'}`;

  const handleAmountChange = (value: string) => {
    setAmountInput(value);
    if (tradeError) {
      setTradeError(null);
    }
    if (tradeSuccess) {
      setTradeSuccess(null);
    }
  };

  const mintedLabel =
    tradeSide === 'buy'
      ? `${isYesSelected ? 'YES' : 'NO'} tokens minted`
      : `${isYesSelected ? 'YES' : 'NO'} tokens sold`;
  const payoutLabel =
    tradeSide === 'buy'
      ? `Payout if ${isYesSelected ? 'Yes' : 'No'}`
      : 'Estimated proceeds';

  const tradeButtonLabel =
    tradeSide === 'buy'
      ? `Buy ${isYesSelected ? 'YES' : 'NO'}`
      : `Sell ${isYesSelected ? 'YES' : 'NO'}`;

  const isTradeActionDisabled =
    !isWalletConnected || !marketState || !tradeQuote || isTradePending;

  const handlePresetAdd = (increment: number) => {
    setAmountInput((prev) => {
      const current = Number(prev || 0);
      const next = current + increment;
      if (!Number.isFinite(next)) {
        return prev;
      }
      const precision = tradeSide === 'buy' ? Math.min(collateralDecimals, 6) : 4;
      const updated = next.toFixed(Math.max(2, precision));
      if (tradeError) {
        setTradeError(null);
      }
      if (tradeSuccess) {
        setTradeSuccess(null);
      }
      return updated;
    });
  };

  const handleSetMax = () => {
    if (tradeSide === 'buy') {
      handleAmountChange(usdcBalanceRaw);
    } else {
      handleAmountChange(isYesSelected ? yesBalanceRaw : noBalanceRaw);
    }
  };

  const handleTrade = async () => {
    if (!marketState) {
      setTradeError('Unable to load market state for trading.');
      return;
    }
    if (!amountInput || amountInput.trim() === '') {
      setTradeError('Enter an amount to trade.');
      return;
    }
    try {
      const amountBigInt =
        tradeSide === 'buy'
          ? parseUnits(amountInput, collateralDecimals)
          : parseUnits(amountInput, 18);
      if (amountBigInt <= BigInt(0)) {
        setTradeError('Amount must be greater than zero.');
        return;
      }

      setIsTradePending(true);
      setTradeError(null);
      setTradeSuccess(null);

      const result = await executeTrade(marketState.conditionId, marketState, {
        side: tradeSide,
        outcome: selectedOutcome,
        amount: amountBigInt,
      });

      setTradeSuccess('Trade executed successfully.');
      setAmountInput('');

      const refreshedState = await loadMarketTradingState(marketId);
      setMarketState(refreshedState);

      if (walletAddress && refreshedState) {
        try {
          const refreshedBalances = await getUserBalances(refreshedState, walletAddress);
          setUserBalances(refreshedBalances);
        } catch (balanceErr) {
          console.error('Failed to refresh balances:', balanceErr);
        }
      } else if (!refreshedState) {
        setUserBalances(null);
      }

      try {
        const updatedMarket = await getBlockchainMarketById(marketId);
        if (updatedMarket) {
          setMarket(updatedMarket as unknown as Market);
        }
      } catch (marketErr) {
        console.warn('Failed to refresh market view:', marketErr);
      }
    } catch (err) {
      console.error('Trade execution failed:', err);
      setTradeError(err instanceof Error ? err.message : 'Failed to execute trade.');
    } finally {
      setIsTradePending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0511] flex items-center justify-center">
        <div className="text-white text-xl">Loading market...</div>
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="min-h-screen bg-[#0c0511] flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">{error || 'Market not found'}</div>
          <button
            onClick={() => router.push('/')}
            className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Back to Markets
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0511] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button
              onClick={() => router.push('/')}
              className="text-white/70 hover:text-white transition-colors"
            >
              ← Back to Markets
            </button>
            <div className="flex items-center gap-2 text-sm text-white/70">
              <span>Markets</span>
              <span>/</span>
              <span>{market.category}</span>
              <span>/</span>
              <span className="text-white">Market Detail</span>
            </div>
          </div>
          
          {isWalletConnected && (
            <WalletButton address={walletAddress} onDisconnect={handleWalletDisconnect} />
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Market Header */}
        <div className="mb-8">
          <div className="flex items-start gap-6">
            <div className="w-16 h-16 bg-gradient-to-br from-fuchsia-700/30 to-indigo-700/20 rounded-lg"></div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-4">{market.question}</h1>
              <div className="flex items-center gap-6 text-sm text-white/70">
                <div className="flex items-center gap-2">
                  <span>💰</span>
                  <span>{market.volumeUSDC.toFixed(3)} USDC</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>⏰</span>
                  <span>{new Date(market.endTime * 1000).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>👤</span>
                  <span>
                    Created by {(market as any).creator ? `${(market as any).creator.slice(0,6)}...${(market as any).creator.slice(-4)}` : '—'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <div className="bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-sm">
                  YES {Math.round(market.yesPrice * 100)}%
                </div>
                <div className="bg-rose-500/20 text-rose-300 px-3 py-1 rounded-full text-sm">
                  NO {Math.round(market.noPrice * 100)}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trading Interface */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Trading */}
          <div className="lg:col-span-2">
            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-6">Trade</h2>
              
              {/* Buy/Sell Toggle */}
              <div className="flex items-center gap-2 mb-6">
                <button
                  onClick={() => {
                    setTradeSide('buy');
                    setTradeError(null);
                    setTradeSuccess(null);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    tradeSide === 'buy'
                      ? 'bg-fuchsia-600 text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  Buy
                </button>
                <button
                  onClick={() => {
                    setTradeSide('sell');
                    setTradeError(null);
                    setTradeSuccess(null);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    tradeSide === 'sell'
                      ? 'bg-fuchsia-600 text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  Sell
                </button>
                <span className="text-white/70 ml-4">{tradeSummary}</span>
              </div>

              {/* YES/NO Options */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <button
                  onClick={() => {
                    setSelectedOutcome('yes');
                    setTradeError(null);
                    setTradeSuccess(null);
                  }}
                  className={`p-4 rounded-lg transition-colors border ${
                    isYesSelected
                      ? 'bg-emerald-500/30 border-emerald-400'
                      : 'bg-emerald-500/20 border-emerald-500/30 hover:bg-emerald-500/30'
                  }`}
                >
                  <div className="text-emerald-300 font-semibold">YES</div>
                  <div className="text-white text-lg">${market.yesPrice.toFixed(4)}</div>
                  <div className="text-emerald-300/70 text-sm">{Math.round(market.yesPrice * 100)}% probability</div>
                  <div className="text-emerald-300/70 text-sm">{(1 / market.yesPrice).toFixed(2)}x</div>
                </button>
                <button
                  onClick={() => {
                    setSelectedOutcome('no');
                    setTradeError(null);
                    setTradeSuccess(null);
                  }}
                  className={`p-4 rounded-lg transition-colors border ${
                    !isYesSelected
                      ? 'bg-rose-500/30 border-rose-400'
                      : 'bg-rose-500/20 border-rose-500/30 hover:bg-rose-500/30'
                  }`}
                >
                  <div className="text-rose-300 font-semibold">NO</div>
                  <div className="text-white text-lg">${market.noPrice.toFixed(4)}</div>
                  <div className="text-rose-300/70 text-sm">{Math.round(market.noPrice * 100)}% probability</div>
                  <div className="text-rose-300/70 text-sm">{(1 / market.noPrice).toFixed(2)}x</div>
                </button>
              </div>

              {/* Amount Input */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white/70">Amount</span>
                  <span className="text-white/70">Balance: {balanceLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      min="0"
                      placeholder="0.00"
                      value={amountInput}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/50"
                    />
                    <div className="absolute right-3 top-3 flex items-center gap-1">
                      <span className="text-white/70 text-sm">
                        {tradeSide === 'buy' ? 'USDC' : isYesSelected ? 'YES' : 'NO'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {[0.1, 1, 5].map((increment) => (
                      <button
                        key={increment}
                        onClick={() => handlePresetAdd(increment)}
                        className="bg-white/10 text-white/70 px-3 py-2 rounded text-sm hover:bg-white/20 transition-colors"
                      >
                        {tradeSide === 'buy' ? `+$${increment}` : `+${increment}`}
                      </button>
                    ))}
                    <button
                      onClick={handleSetMax}
                      className="bg-white/10 text-white/70 px-3 py-2 rounded text-sm hover:bg-white/20 transition-colors"
                    >
                      Max
                    </button>
                  </div>
                </div>
              </div>

              {/* Holdings */}
              <div className="mb-6">
                <h3 className="text-white font-medium mb-3">Your Holdings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-emerald-300 text-sm">YES Tokens</div>
                    <div className="text-white">{yesBalanceDisplay}</div>
                    <div className="text-white/70 text-sm">${yesValueDisplay} value</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-rose-300 text-sm">NO Tokens</div>
                    <div className="text-white">{noBalanceDisplay}</div>
                    <div className="text-white/70 text-sm">${noValueDisplay} value</div>
                  </div>
                </div>
              </div>

              {/* Trade Info */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-white/70 text-sm mb-1">{mintedLabel}</div>
                  <div className="text-white">{mintedTokensDisplay}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-white/70 text-sm mb-1">{payoutLabel}</div>
                  <div className="text-white">${payoutDisplay}</div>
                </div>
              </div>

              {/* Trade Button */}
              {isWalletConnected ? (
                <>
                  <button
                    onClick={handleTrade}
                    disabled={isTradeActionDisabled}
                    className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                      isTradeActionDisabled
                        ? 'bg-fuchsia-600/40 text-white/60 cursor-not-allowed'
                        : 'bg-fuchsia-600 hover:bg-fuchsia-700 text-white'
                    }`}
                  >
                    {isTradePending ? 'Processing…' : tradeButtonLabel}
                  </button>
                  {tradeError && (
                    <div className="text-rose-400 text-sm mt-3">{tradeError}</div>
                  )}
                  {tradeSuccess && (
                    <div className="text-emerald-300 text-sm mt-3">{tradeSuccess}</div>
                  )}
                </>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      const { signer } = await connectWallet();
                      const address = await signer.getAddress();
                      handleWalletConnected(address);
                    } catch (err) {
                      console.error('Failed to connect wallet:', err);
                    }
                  }}
                  className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white py-3 rounded-lg font-semibold transition-colors"
                >
                  Connect Wallet to Trade
                </button>
              )}
            </div>
          </div>

          {/* Right Column - Market Status */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <div className="text-center mb-6">
                <div className="text-emerald-400 text-sm mb-2">Market is live</div>
                <div className="text-white/70 text-sm mb-1">Settlement Countdown</div>
                <div className="text-white text-xl font-semibold">
                  {Math.ceil((market.endTime * 1000 - Date.now()) / (1000 * 60 * 60 * 24))} days
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                  <div>
                    <div className="text-white/70 text-sm">Market created</div>
                    <div className="text-white text-sm">{market && (market as any).createdAt ? new Date((market as any).createdAt).toLocaleString() : '—'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                  <div>
                    <div className="text-white/70 text-sm">Predictions close</div>
                    <div className="text-white text-sm">{new Date(market.endTime * 1000).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <div>
                    <div className="text-white/70 text-sm">Resolution</div>
                    <div className="text-white text-sm">TBD</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-6">Settlement Criteria</h2>

              <div className="text-white/90 leading-relaxed">
                {savedAnalysis ? (
                  <>
                    <div className="mb-4">
                      <p className="text-white/90 text-sm leading-relaxed">{savedAnalysis.settlementCriteria}</p>
                    </div>
                    {(savedAnalysis.reasoning || (savedAnalysis.resolutionSources || []).length > 0) && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setAnalysisExpanded((prev) => !prev)}
                          className="w-full flex items-center justify-between bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                        >
                          <span>AI Reasoning &amp; Resolution Sources</span>
                          <span className="text-lg leading-none">{analysisExpanded ? '-' : '+'}</span>
                        </button>
                        {analysisExpanded && (
                          <div className="mt-4 space-y-4">
                            {savedAnalysis.reasoning && (
                              <div>
                                <h4 className="text-white font-medium mb-2 text-sm uppercase tracking-wide">AI Reasoning</h4>
                                <p className="text-white/90 text-sm leading-relaxed">{savedAnalysis.reasoning}</p>
                              </div>
                            )}
                            {Array.isArray(savedAnalysis.resolutionSources) && savedAnalysis.resolutionSources.length > 0 && (
                              <div>
                                <h4 className="text-white font-medium mb-2 text-sm uppercase tracking-wide">Resolution Sources</h4>
                                <ul className="list-disc pl-5 space-y-1 text-sm text-white/90">
                                  {savedAnalysis.resolutionSources.map((src: string, i: number) => (
                                    <li key={i}>
                                      <a className="text-fuchsia-300 hover:underline" href={src} target="_blank" rel="noreferrer">
                                        {src}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-white/70 text-sm">
                    Settlement details will appear here once provided during market creation.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
        
      </main>
    </div>
  );
}
