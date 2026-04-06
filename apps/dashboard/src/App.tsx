import { useState } from "react";
import { useSwarmData } from "./hooks/useSwarm.js";
import { SwarmMap } from "./pages/SwarmMap.js";
import { ShipperView } from "./pages/ShipperView.js";
import { CourierView } from "./pages/CourierView.js";
import { EconomyView } from "./pages/EconomyView.js";

type View = "map" | "shipper" | "courier" | "economy";

export default function App() {
  const [view, setView] = useState<View>("economy");
  const data = useSwarmData();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">SwarmHaul</h1>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-mono">
            devnet
          </span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
              data.connected
                ? "bg-green-500/20 text-green-400"
                : "bg-red-500/20 text-red-400"
            }`}
          >
            {data.connected ? "live" : "offline"}
          </span>
        </div>
        <nav className="flex gap-1">
          {(
            [
              ["map", "Map"],
              ["shipper", "Ship"],
              ["courier", "Courier"],
              ["economy", "Economy"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                view === key
                  ? "bg-white/10 text-white font-medium"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="bg-purple-600 hover:bg-purple-500 px-4 py-1.5 rounded text-sm font-medium transition-colors">
          Connect Wallet
        </button>
      </header>

      <main className="p-4">
        {view === "map" && <SwarmMap packages={data.packages} />}
        {view === "shipper" && <ShipperView />}
        {view === "courier" && <CourierView leaderboard={data.leaderboard} />}
        {view === "economy" && (
          <EconomyView
            stats={data.stats}
            activity={data.activity}
            leaderboard={data.leaderboard}
            wsEvents={data.wsEvents}
          />
        )}
      </main>
    </div>
  );
}
