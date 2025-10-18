
'use client';

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { listMockMarkets, type Market } from "@/lib/markets";
import CreateMarketForm from "@/components/CreateMarketForm";
import WalletConnection from "@/components/WalletConnection";
import WalletButton from "@/components/WalletButton";
import { connectWallet } from "@/lib/blockchain";

type SortKey = "volume" | "newest" | "ending";

type HowItWorksStep = {
  title: string;
  description: string;
  imageSrc: string;
};

export default function Home() {
  const router = useRouter();
  const [isWalletConnected, setIsWalletConnected] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined') {
        return localStorage.getItem('walletConnected') === '1';
      }
    } catch (_) {}
    return false;
  });
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("volume");
  const [showHowItWorks, setShowHowItWorks] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [showCreateMarket, setShowCreateMarket] = useState<boolean>(false);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Detect existing wallet connection on first load (no prompt)
  useEffect(() => {
    const detectConnection = async () => {
      try {
        if (typeof window !== 'undefined') {
          // If we've previously connected in this session
          const persisted = localStorage.getItem('walletConnected');
          // Or if the wallet already has authorized accounts
          const eth: any = (window as any).ethereum;
          if (eth && eth.request) {
            const accounts = await eth.request({ method: 'eth_accounts' });
            if (accounts && accounts.length > 0) {
              setIsWalletConnected(true);
              setWalletAddress(accounts[0]);
              localStorage.setItem('walletConnected', '1');
              localStorage.setItem('walletAddress', accounts[0]);
              return;
            }
          }
          // Fallback to stored address if user previously connected
          if (persisted === '1') {
            const cachedAddr = localStorage.getItem('walletAddress');
            if (cachedAddr) setWalletAddress(cachedAddr);
            setIsWalletConnected(true);
          }
        }
      } catch (_) {}
    };
    detectConnection();
  }, []);

  // Load markets from blockchain (only after wallet connection)
  useEffect(() => {
    if (!isWalletConnected) return;
    
    const loadMarkets = async () => {
      setLoading(true);
      try {
        const fetchedMarkets = await listMockMarkets({ category, search, sort });
        setMarkets(fetchedMarkets);
      } catch (error) {
        console.error('Error loading markets:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMarkets();
  }, [isWalletConnected, category, search, sort]);

  // Handle wallet connection
  const handleWalletConnected = (address: string) => {
    setWalletAddress(address);
    setIsWalletConnected(true);
    try {
      localStorage.setItem('walletConnected', '1');
      localStorage.setItem('walletAddress', address);
    } catch (_) {}
  };

  // Handle wallet disconnection
  const handleWalletDisconnect = () => {
    setWalletAddress("");
    setIsWalletConnected(false);
    setMarkets([]);
  };

  // Refresh markets when create market modal closes
  const handleCreateMarketClose = async () => {
    setShowCreateMarket(false);
    // Refresh markets to show newly created ones
    if (isWalletConnected) {
      const fetchedMarkets = await listMockMarkets({ category, search, sort });
      setMarkets(fetchedMarkets);
    }
  };
  
  const howItWorksSteps: HowItWorksStep[] = [
    {
      title: "1. Pick a Polymarket",
      description: "Buy 'Yes' or 'No' shares depending on your prediction. Buying shares is like betting on the outcome. Odds shift in real time as other traders bet.",
      imageSrc: "/step1.png"
    },
    {
      title: "2. Place a Bet",
      description: "Fund your account with crypto, credit/debit card, or bank transfer—then you're ready to bet. No bet limits and no fees.",
      imageSrc: "/step2.png"
    },
    {
      title: "3. Profit 🤑",
      description: "Sell your 'Yes' or 'No' shares at any time, or wait until the market ends to redeem winning shares for $1 each. Create an account and place your first trade in minutes.",
      imageSrc: "/step3.png"
    }
  ];
  
  // Show wallet connection screen if not connected
  if (!isWalletConnected) {
    return <WalletConnection onConnected={handleWalletConnected} />;
  }
  
  return (
    <div className="px-12 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <img src="/owlphaLogo.svg" alt="Owlpha" className="h-40 w-40" />
          <nav className="flex items-center gap-8 text-sm text-white/80">
            <button 
              onClick={() => setShowHowItWorks(true)}
              className="font-semibold text-white hover:text-white/80 transition-colors"
            >
              How it works
            </button>
            <span className="text-white">Explore markets</span>
            <span className="text-white/70">Leaderboard</span>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowCreateMarket(true)}
            className="boton-elegante relative overflow-hidden px-8 py-4 border-2 border-neutral-700 bg-neutral-900 text-white text-xl cursor-pointer rounded-full transition-all duration-400 outline-none font-bold hover:border-neutral-500 hover:bg-fuchsia-600/20 group"
          >
            Create Market
            <span className="absolute top-0 left-0 w-full h-full bg-gradient-radial from-white/25 to-transparent opacity-0 scale-0 transition-transform duration-500 group-hover:scale-[4] group-hover:opacity-100"></span>
          </button>
          <WalletButton address={walletAddress} onDisconnect={handleWalletDisconnect} />
        </div>
      </header>

      <h1 className="mb-6 text-3xl font-bold">Markets Browser</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {["All", "Trending", "Sports", "Politics", "Technology", "ICM", "Settled"].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full px-3 py-1 text-sm ${category === c ? "bg-white/15 text-white" : "bg-white/5 text-white/80"}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mb-8 flex items-center gap-3">
        <input
          placeholder="Search market, traders, etc..."
          className="w-full rounded-md bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/50"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="rounded-md bg-white/10 px-4 text-sm" onClick={() => { /* noop: live filter */ }}>Search</button>
        <div className="ml-auto flex items-center gap-2 text-sm text-white/70">
          <span>Sort:</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-md bg-white/5 px-3 py-1">
            <option value="volume">Volume</option>
            <option value="newest">Newest</option>
            <option value="ending">Ending Soon</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="col-span-full text-center text-white/60 py-12">
            Loading markets...
          </div>
        ) : markets.length === 0 ? (
          <div className="col-span-full text-center text-white/60 py-12">
            No markets found. Create the first one!
          </div>
        ) : (
          markets.map((m) => (
            <article 
              key={m.id} 
              className="overflow-hidden rounded-xl border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors"
              onClick={() => router.push(`/markets/${m.id}`)}
            >
              <div className="h-40 w-full bg-gradient-to-br from-fuchsia-700/30 to-indigo-700/20" />
              <div className="space-y-3 p-4">
                <h3 className="text-sm text-white/90">{m.question}</h3>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300">YES ${m.yesPrice.toFixed(2)}</span>
                  <span className="rounded bg-rose-500/20 px-2 py-0.5 text-rose-300">NO ${m.noPrice.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-white/60">
                  <span>Vol: {m.volumeUSDC.toFixed(3)} USDC</span>
                  <span>{new Date(m.endTime * 1000).toISOString().split('T')[0]}</span>
                </div>
              </div>
            </article>
          ))
        )}
      </div>

      {/* How It Works Modal */}
      {showHowItWorks && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full mx-4 overflow-hidden relative">
            {/* Close button */}
            <button 
              onClick={() => {
                setShowHowItWorks(false);
                setCurrentStep(0);
              }}
              className="absolute top-4 right-4 z-10 text-gray-600 hover:text-gray-800 transition-colors bg-white/80 rounded-full p-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Modal content - flex column layout */}
            <div className="flex flex-col w-full h-[500px]">
              {/* Image section - top half */}
              <div className="w-full h-1/2">
                <img 
                  src={howItWorksSteps[currentStep].imageSrc} 
                  alt={howItWorksSteps[currentStep].title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback gradient background
                    e.currentTarget.src = "";
                    e.currentTarget.style.background = "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)";
                  }}
                />
              </div>
              
              {/* Content section - bottom half */}
              <div className="flex flex-col px-5 pb-5 pt-4 w-full h-1/2">
                {/* Title and description */}
                <div className="flex-1 flex flex-col justify-center items-center w-full min-h-[80px] mb-7">
                  <h2 className="text-2xl text-center font-semibold mb-2 text-gray-900">
                    {howItWorksSteps[currentStep].title}
                  </h2>
                  <p className="text-sm text-gray-600 text-center px-2 leading-relaxed">
                    {howItWorksSteps[currentStep].description}
                  </p>
                </div>
                
                {/* Navigation */}
                <div className="flex w-full">
                  {currentStep < howItWorksSteps.length - 1 ? (
                    <button 
                      onClick={() => setCurrentStep(currentStep + 1)}
                      className="inline-flex items-center cursor-pointer active:scale-[97%] transition justify-center gap-2 whitespace-nowrap text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-fuchsia-600 text-white hover:bg-fuchsia-700 rounded-sm px-8 h-11 w-full"
                    >
                      Next
                    </button>
                  ) : (
                    <button 
                      onClick={() => {
                        setShowHowItWorks(false);
                        setCurrentStep(0);
                      }}
                      className="inline-flex items-center cursor-pointer active:scale-[97%] transition justify-center gap-2 whitespace-nowrap text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-emerald-600 text-white hover:bg-emerald-700 rounded-sm px-8 h-11 w-full"
                    >
                      Get Started
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Market Form Modal */}
      <CreateMarketForm 
        isOpen={showCreateMarket} 
        onClose={handleCreateMarketClose} 
      />
    </div>
  );
}
