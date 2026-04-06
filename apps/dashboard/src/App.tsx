import { useState } from "react";

type View = "map" | "shipper" | "courier" | "economy";

export default function App() {
  const [view, setView] = useState<View>("map");

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">SwarmHaul</h1>
          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
            devnet
          </span>
        </div>
        <nav className="flex gap-1">
          {(
            [
              ["map", "Swarm Map"],
              ["shipper", "Ship"],
              ["courier", "Courier"],
              ["economy", "Economy"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`px-3 py-1.5 rounded text-sm transition ${
                view === key
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div>
          <button className="bg-purple-600 hover:bg-purple-500 px-4 py-1.5 rounded text-sm font-medium transition">
            Connect Wallet
          </button>
        </div>
      </header>
      <main className="p-6">
        {view === "map" && (
          <div className="text-gray-400 text-center py-20">
            Swarm Map — coming soon
          </div>
        )}
        {view === "shipper" && (
          <div className="text-gray-400 text-center py-20">
            Shipper View — coming soon
          </div>
        )}
        {view === "courier" && (
          <div className="text-gray-400 text-center py-20">
            Courier View — coming soon
          </div>
        )}
        {view === "economy" && (
          <div className="text-gray-400 text-center py-20">
            Agent Economy Observatory — coming soon
          </div>
        )}
      </main>
    </div>
  );
}
