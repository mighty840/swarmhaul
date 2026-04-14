import { useState } from "react";
import { useSwarmData } from "./hooks/useSwarm.js";
import { StatusBar } from "./components/StatusBar.js";
import { Ticker } from "./components/Ticker.js";
import { SwarmMap } from "./pages/SwarmMap.js";
import { ShipperView } from "./pages/ShipperView.js";
import { CourierView } from "./pages/CourierView.js";
import { EconomyView } from "./pages/EconomyView.js";
import { ReputationModelView } from "./pages/ReputationModelView.js";

type View = "map" | "shipper" | "courier" | "economy" | "reputation";

export default function App() {
  const [view, setView] = useState<View>("economy");
  const data = useSwarmData();

  return (
    <div className="min-h-screen flex flex-col">
      <StatusBar
        connected={data.connected}
        packagesActive={data.stats?.packages.active ?? 0}
        bidsTotal={data.stats?.bids.total ?? 0}
        agentsTotal={data.stats?.agents.total ?? 0}
        view={view}
        onViewChange={setView}
      />
      <Ticker events={data.wsEvents} />

      <main className="flex-1 p-4 lg:p-6">
        {view === "economy" && (
          <EconomyView
            stats={data.stats}
            activity={data.activity}
            leaderboard={data.leaderboard}
            wsEvents={data.wsEvents}
          />
        )}
        {view === "map" && <SwarmMap packages={data.packages} />}
        {view === "shipper" && <ShipperView />}
        {view === "courier" && <CourierView leaderboard={data.leaderboard} />}
        {view === "reputation" && <ReputationModelView />}
      </main>

      <footer className="border-t border-[var(--color-line)] bg-[var(--color-graphite)] px-4 h-7 flex items-center justify-between text-[9px] tracking-[0.16em] uppercase text-[var(--color-dim)]">
        <div>SWARMHAUL ▸ MULTI-AGENT COORDINATION PROTOCOL ▸ SOLANA</div>
        <div className="flex items-center gap-4">
          <span>RFB-05 // RFB-02 // RFB-01</span>
          <span className="text-[var(--color-faint)]">│</span>
          <span className="text-[var(--color-phosphor)]">⏵ READY</span>
        </div>
      </footer>
    </div>
  );
}
