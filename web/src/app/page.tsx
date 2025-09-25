'use client';

import { useMemo, useState } from "react";
import { listMockMarkets, type Market } from "@/lib/markets";

type SortKey = "volume" | "newest" | "ending";

export default function Home() {
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("volume");
  const markets = useMemo<Market[]>(() => listMockMarkets({ category, search, sort }), [category, search, sort]);
  return (
    <div className="px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <nav className="flex items-center gap-8 text-sm text-white/80">
          <span className="font-semibold text-white">How it works</span>
          <span className="text-white">Explore markets</span>
          <span className="text-white/70">Leaderboard</span>
        </nav>
        <button className="rounded-full border border-fuchsia-400/40 bg-fuchsia-600/20 px-4 py-2 text-sm text-fuchsia-200">Create Market</button>
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
        {markets.map((m) => (
          <article key={m.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
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
        ))}
      </div>
    </div>
  );
}
