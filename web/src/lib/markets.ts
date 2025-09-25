export type Market = {
  id: string;
  question: string;
  category: string;
  endTime: number; // epoch seconds
  yesPrice: number; // 0..1
  noPrice: number; // 0..1
  volumeUSDC: number;
  imageUrl?: string;
  settled: boolean;
};

const mockMarkets: Market[] = [
  {
    id: "m-eth-7500",
    question: "Will Ethereum reach $7500 per token before the end of 2025?",
    category: "Technology",
    endTime: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90,
    yesPrice: 0.78,
    noPrice: 0.63,
    volumeUSDC: 947.079,
    imageUrl: "/placeholder/eth.png",
    settled: false,
  },
  {
    id: "m-poly-token-2025",
    question: "Will Polymarket launch a token in 2025?",
    category: "Technology",
    endTime: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180,
    yesPrice: 0.23,
    noPrice: 0.97,
    volumeUSDC: 775.823,
    imageUrl: "/placeholder/poly.png",
    settled: false,
  },
  {
    id: "m-coin-launch-sept",
    question: "Will Launchcoin be above $100M mcap by the end of September?",
    category: "Technology",
    endTime: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 10,
    yesPrice: 0.61,
    noPrice: 0.79,
    volumeUSDC: 570.481,
    imageUrl: "/placeholder/rocket.png",
    settled: false,
  },
  {
    id: "m-sol-ath",
    question: "Solana to break its current all time high before the EOY",
    category: "Technology",
    endTime: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 60,
    yesPrice: 0.55,
    noPrice: 0.45,
    volumeUSDC: 320.12,
    imageUrl: "/placeholder/sol.png",
    settled: false,
  },
  {
    id: "m-decarlo-case",
    question: "Will Decarlos Brown Jr receive the death penalty before the deadline?",
    category: "Politics",
    endTime: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 45,
    yesPrice: 0.14,
    noPrice: 0.86,
    volumeUSDC: 128.5,
    imageUrl: "/placeholder/person.png",
    settled: false,
  },
  {
    id: "m-btc-spot",
    question: "Will Useless Coin have a higher USD spot price than Troll Coin by EOM?",
    category: "Technology",
    endTime: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 20,
    yesPrice: 0.32,
    noPrice: 0.68,
    volumeUSDC: 210.44,
    imageUrl: "/placeholder/btc.png",
    settled: false,
  },
];

export type MarketFilters = {
  category?: string;
  search?: string;
  sort?: "volume" | "newest" | "ending";
};

export function listMockMarkets(filters: MarketFilters = {}): Market[] {
  let items = [...mockMarkets];
  if (filters.category && filters.category !== "All") {
    items = items.filter((m) => m.category === filters.category);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    items = items.filter((m) => m.question.toLowerCase().includes(q));
  }
  switch (filters.sort) {
    case "volume":
      items.sort((a, b) => b.volumeUSDC - a.volumeUSDC);
      break;
    case "newest":
      items.sort((a, b) => b.endTime - a.endTime);
      break;
    case "ending":
      items.sort((a, b) => a.endTime - b.endTime);
      break;
    default:
      items.sort((a, b) => b.volumeUSDC - a.volumeUSDC);
  }
  return items;
}

