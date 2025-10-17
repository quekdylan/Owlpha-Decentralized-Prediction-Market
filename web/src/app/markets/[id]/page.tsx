'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { listMockMarkets, type Market } from '@/lib/markets';
import { getBlockchainMarketById } from '@/lib/blockchain';
import WalletButton from '@/components/WalletButton';
import { connectWallet } from '@/lib/blockchain';

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
                <button className="bg-fuchsia-600 text-white px-4 py-2 rounded-lg font-medium">
                  Buy
                </button>
                <button className="bg-white/10 text-white/70 px-4 py-2 rounded-lg font-medium hover:bg-white/20 transition-colors">
                  Sell
                </button>
                <span className="text-white/70 ml-4">Buying Yes Share</span>
              </div>

              {/* YES/NO Options */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <button className="bg-emerald-500/20 border border-emerald-500/30 p-4 rounded-lg hover:bg-emerald-500/30 transition-colors">
                  <div className="text-emerald-300 font-semibold">YES</div>
                  <div className="text-white text-lg">${market.yesPrice.toFixed(4)}</div>
                  <div className="text-emerald-300/70 text-sm">{Math.round(market.yesPrice * 100)}% probability</div>
                  <div className="text-emerald-300/70 text-sm">{(1 / market.yesPrice).toFixed(2)}x</div>
                </button>
                <button className="bg-rose-500/20 border border-rose-500/30 p-4 rounded-lg hover:bg-rose-500/30 transition-colors">
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
                  <span className="text-white/70">Balance: 0.00 USDC</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      placeholder="0.00"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/50"
                    />
                    <div className="absolute right-3 top-3 flex items-center gap-1">
                      <span className="text-white/70 text-sm">USDC</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="bg-white/10 text-white/70 px-3 py-2 rounded text-sm hover:bg-white/20 transition-colors">
                      +$0.1
                    </button>
                    <button className="bg-white/10 text-white/70 px-3 py-2 rounded text-sm hover:bg-white/20 transition-colors">
                      +$1
                    </button>
                    <button className="bg-white/10 text-white/70 px-3 py-2 rounded text-sm hover:bg-white/20 transition-colors">
                      +$5
                    </button>
                    <button className="bg-white/10 text-white/70 px-3 py-2 rounded text-sm hover:bg-white/20 transition-colors">
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
                    <div className="text-white">0.00</div>
                    <div className="text-white/70 text-sm">$0.00 value</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-rose-300 text-sm">NO Tokens</div>
                    <div className="text-white">0.00</div>
                    <div className="text-white/70 text-sm">$0.00 value</div>
                  </div>
                </div>
              </div>

              {/* Trade Info */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-white/70 text-sm mb-1">YES tokens minted</div>
                  <div className="text-white">0.00</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-white/70 text-sm mb-1">Payout if Yes</div>
                  <div className="text-white">$0.00</div>
                </div>
              </div>

              {/* Trade Button */}
              {isWalletConnected ? (
                <button className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white py-3 rounded-lg font-semibold transition-colors">
                  Connect Wallet to Trade
                </button>
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
          <div className="lg:col-span-1">
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
          </div>
        </div>

        {/* Settlement Information Section */}
        <div className="mt-12">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-6">Settlement Criteria</h2>
            
            

            {/* Tab Content */}
            <div className="text-white/90 leading-relaxed">
              {savedAnalysis ? (
                <>
                  <div className="mb-4">
                    <h4 className="text-white font-medium mb-2">AI Reasoning</h4>
                    <p className="text-white/90 text-sm leading-relaxed">{savedAnalysis.reasoning}</p>
                  </div>
                  <div className="mb-4">
                    <h4 className="text-white font-medium mb-2">Resolution Sources</h4>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-white/90">
                      {(savedAnalysis.resolutionSources || []).map((src: string, i: number) => (
                        <li key={i}><a className="text-fuchsia-300 hover:underline" href={src} target="_blank" rel="noreferrer">{src}</a></li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-white font-medium mb-2">Settlement Criteria</h4>
                    <p className="text-white/90 text-sm leading-relaxed">{savedAnalysis.settlementCriteria}</p>
                  </div>
                </>
              ) : (
                <p className="text-white/70 text-sm">Settlement details will appear here once provided during market creation.</p>
              )}
            </div>
          </div>
        </div>

        
      </main>
    </div>
  );
}
