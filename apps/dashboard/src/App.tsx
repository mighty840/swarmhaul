import { useCallback, useState } from "react";
import { useSwarmData } from "./hooks/useSwarm.js";
import { StatusBar, type ViewKey } from "./components/StatusBar.js";
import { Ticker } from "./components/Ticker.js";
import { ErrorProvider } from "./components/ErrorBanner.js";
import { WalletAdapterProvider } from "./providers/WalletProvider.js";
import { SwarmMap } from "./pages/SwarmMap.js";
import { ShipperView } from "./pages/ShipperView.js";
import { CourierView } from "./pages/CourierView.js";
import { EconomyView } from "./pages/EconomyView.js";
import { ReputationModelView } from "./pages/ReputationModelView.js";
import { SwarmDetailView } from "./pages/SwarmDetailView.js";
import { DigitalTasksView } from "./pages/DigitalTasksView.js";
import { ClaimRewardsView } from "./pages/ClaimRewardsView.js";

function AppShell() {
  const [view, setView] = useState<ViewKey>("economy");
  const [detailPackageId, setDetailPackageId] = useState<string | null>(null);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const [returnView, setReturnView] = useState<ViewKey>("economy");
  const data = useSwarmData();

  const openSwarm = useCallback(
    (packageId: string) => {
      setReturnView(view === "swarm-detail" ? returnView : view);
      setDetailPackageId(packageId);
      setView("swarm-detail");
    },
    [view, returnView],
  );

  const openDigitalTask = useCallback((taskId: string) => {
    setHighlightTaskId(taskId);
    setView("digital");
  }, []);

  const handleViewChange = useCallback((next: ViewKey) => {
    setView(next);
    if (next !== "swarm-detail") setDetailPackageId(null);
    if (next !== "digital") setHighlightTaskId(null);
  }, []);

  const goBack = useCallback(() => {
    setView(returnView);
    setDetailPackageId(null);
  }, [returnView]);

  return (
    <div className="min-h-screen flex flex-col">
      <StatusBar
        connected={data.connected}
        packagesActive={data.stats?.packages.active ?? 0}
        bidsTotal={data.stats?.bids.total ?? 0}
        agentsTotal={data.stats?.agents.total ?? 0}
        view={view}
        onViewChange={handleViewChange}
      />
      <Ticker events={data.wsEvents} />

      <main className="flex-1 p-2 sm:p-4 lg:p-6">
        {view === "economy" && (
          <EconomyView
            stats={data.stats}
            activity={data.activity}
            leaderboard={data.leaderboard}
            wsEvents={data.wsEvents}
            onOpenSwarm={openSwarm}
            onOpenDigitalTask={openDigitalTask}
          />
        )}
        {view === "map" && (
          <SwarmMap packages={data.packages} onOpenSwarm={openSwarm} />
        )}
        {view === "shipper" && <ShipperView />}
        {view === "courier" && <CourierView leaderboard={data.leaderboard} />}
        {view === "digital" && <DigitalTasksView wsEvents={data.wsEvents} highlightTaskId={highlightTaskId ?? undefined} />}
        {view === "reputation" && <ReputationModelView />}
        {view === "claim" && <ClaimRewardsView />}
        {view === "swarm-detail" && detailPackageId && (
          <SwarmDetailView
            packageId={detailPackageId}
            leaderboard={data.leaderboard}
            onBack={goBack}
          />
        )}
      </main>

      <footer className="border-t border-[var(--color-line)] bg-[var(--color-graphite)] px-4 h-7 flex items-center justify-between text-[9px] tracking-[0.16em] uppercase text-[var(--color-steel)] font-semibold">
        <div>SWARMHAUL ▸ MULTI-AGENT COORDINATION PROTOCOL ▸ SOLANA</div>
        <div className="flex items-center gap-4">
          <a
            href="https://sharang.meghsakha.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--color-phosphor)]"
          >
            SHARANG PARNERKAR ↗
          </a>
          <span className="text-[var(--color-faint)]">│</span>
          <a
            href="https://mighty840.github.io/swarmhaul-pitch/"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--color-phosphor)]"
          >
            PITCH ↗
          </a>
          <span className="text-[var(--color-faint)]">│</span>
          <a
            href="https://docs.swarmhaul.defited.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--color-phosphor)]"
          >
            DOCS ↗
          </a>
          <span className="text-[var(--color-faint)]">│</span>
          <a
            href="https://docs.swarmhaul.defited.com/reference/mcp"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--color-phosphor)]"
          >
            MCP ↗
          </a>
          <span className="text-[var(--color-faint)]">│</span>
          <a
            href="https://mighty840.github.io/swarmhaul-pitch/impressum"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--color-phosphor)]"
          >
            IMPRESSUM
          </a>
          <span className="text-[var(--color-faint)]">│</span>
          <a
            href="https://mighty840.github.io/swarmhaul-pitch/privacy"
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--color-phosphor)]"
          >
            PRIVACY
          </a>
          <span className="text-[var(--color-faint)]">│</span>
          <span>RFB-05 // RFB-02 // RFB-01</span>
          <span className="text-[var(--color-faint)]">│</span>
          <span className="text-[var(--color-phosphor)]">⏵ READY</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <WalletAdapterProvider>
      <ErrorProvider>
        <AppShell />
      </ErrorProvider>
    </WalletAdapterProvider>
  );
}
