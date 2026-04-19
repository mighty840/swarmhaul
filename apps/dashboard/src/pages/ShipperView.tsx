import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Panel } from "../components/Panel.js";
import { LocationPicker } from "../components/LocationPicker.js";
import { useListPackage } from "../hooks/useListPackage.js";
import { useErrorReporter } from "../components/ErrorBanner.js";

function shortenPubkey(pk: string): string {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 6)}··${pk.slice(-4)}`;
}

const PHASE_LABEL: Record<string, string> = {
  idle: "READY",
  building: "BUILDING TX…",
  "awaiting-signature": "AWAITING SIGNATURE",
  sending: "BROADCASTING TX",
  confirming: "CONFIRMING ON-CHAIN",
  persisting: "PERSISTING",
  done: "DELIVERED",
  error: "ERROR",
};

function SliderRow({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step,
  valueTextClass = "text-[var(--color-bone)]",
  labelClass = "label",
  warning,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  valueTextClass?: string;
  labelClass?: string;
  warning?: string | null;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5 gap-2">
        <label className={labelClass}>{label}</label>
        <div className="flex items-baseline gap-1.5">
          <input
            type="number"
            value={value}
            min={min}
            step={step}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(n);
            }}
            // Hide native spinner arrows via CSS — class hides webkit + firefox
            className={`no-spin bg-transparent border border-[var(--color-line-hot)] focus:border-[var(--color-phosphor)] outline-none px-2 py-0.5 text-right tabular-nums font-mono text-[15px] font-semibold w-20 ${valueTextClass}`}
          />
          <span className="text-[10px] text-[var(--color-ash)] tracking-[0.14em] font-semibold">
            {unit}
          </span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full accent-[var(--color-phosphor)]"
      />
      <div className="flex justify-between text-[9px] text-[var(--color-ash)] font-mono tabular-nums mt-0.5">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      {warning && (
        <div className="mt-1.5 text-[10px] text-[var(--color-blood)] tracking-[0.1em] uppercase font-bold">
          ✕ {warning}
        </div>
      )}
    </div>
  );
}

export function ShipperView() {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const { dispatch, phase, reset } = useListPackage();
  const { push } = useErrorReporter();
  const [balanceSol, setBalanceSol] = useState<number | null>(null);

  const [form, setForm] = useState({
    description: "",
    weightKg: 1,
    volumeLitres: 5,
    maxBudgetSol: 0.5,
    originLat: 48.137,
    originLng: 11.575,
    destLat: 48.155,
    destLng: 11.605,
  });

  const refreshBalance = useCallback(async () => {
    if (!connected || !publicKey) {
      setBalanceSol(null);
      return;
    }
    try {
      const lamports = await connection.getBalance(publicKey, "confirmed");
      setBalanceSol(lamports / LAMPORTS_PER_SOL);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      push(`Balance fetch failed: ${msg}`, "wallet");
    }
  }, [connected, publicKey, connection, push]);

  useEffect(() => {
    refreshBalance();
    if (!connected) return;
    const id = setInterval(refreshBalance, 15_000);
    return () => clearInterval(id);
  }, [connected, refreshBalance]);

  useEffect(() => {
    if (phase.kind === "done") refreshBalance();
  }, [phase.kind, refreshBalance]);

  const submitting =
    phase.kind === "building" ||
    phase.kind === "awaiting-signature" ||
    phase.kind === "sending" ||
    phase.kind === "confirming" ||
    phase.kind === "persisting";

  // Need a small SOL buffer for gas/rent even when budget equals balance.
  // Flag if the shipper's locked-escrow cost alone would empty the wallet.
  const overBudget =
    balanceSol !== null && form.maxBudgetSol > balanceSol - 0.005;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (overBudget) {
      push("Budget exceeds your wallet balance.", "dispatch");
      return;
    }
    const result = await dispatch(form);
    if (result) {
      setForm((f) => ({ ...f, description: "" }));
    } else if (phase.kind === "error") {
      push(phase.message, "dispatch");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 glitch-in">
      <div className="border-b border-[var(--color-line)] pb-4">
        <div className="label mb-2">▸ DISPATCH TERMINAL</div>
        <h1 className="text-[32px] leading-none tracking-[-0.02em] font-light text-[var(--color-bone)]">
          <span className="display-serif text-[var(--color-magenta)]">Post</span>{" "}
          a Task
        </h1>
        <p className="text-[12px] text-[var(--color-steel)] mt-3 max-w-lg leading-relaxed">
          List a package for autonomous agent fulfillment. Your wallet signs
          and funds the escrow; bids from autonomous agents arrive within
          seconds. Funds stay locked in a Solana PDA vault until each leg is
          confirmed on-chain.
        </p>
      </div>

      {/* Wallet banner */}
      <Panel
        title={connected ? "CONNECTED WALLET" : "NO WALLET CONNECTED"}
        accent={connected ? "phosphor" : "amber"}
        meta={connected ? "READY TO DISPATCH" : "CONNECT TO PROCEED"}
      >
        <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-5 min-w-0">
            {connected && publicKey ? (
              <>
                <div className="dot-live" />
                <div className="min-w-0">
                  <div className="label-muted mb-0.5">SHIPPER PUBKEY</div>
                  <div className="pubkey text-[13px] text-[var(--color-bone)]">
                    {shortenPubkey(publicKey.toBase58())}
                  </div>
                </div>
                <div className="pl-5 border-l border-[var(--color-line)]">
                  <div className="label-muted mb-0.5">DEVNET BALANCE</div>
                  <div className="text-[16px] font-light tabular-nums text-[var(--color-phosphor)]">
                    {balanceSol === null ? "…" : balanceSol.toFixed(4)}{" "}
                    <span className="text-[10px] text-[var(--color-ash)] font-semibold tracking-[0.14em]">
                      SOL
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="dot-dead" />
                <div className="text-[12px] text-[var(--color-steel)]">
                  Connect a Phantom or Solflare wallet on devnet to dispatch.
                </div>
              </>
            )}
          </div>
          <WalletMultiButton />
        </div>
      </Panel>

      <Panel title="NEW DISPATCH ORDER" accent="magenta">
        <form onSubmit={handleSubmit} className="p-5 space-y-6">
          <div>
            <label className="block label mb-2">PAYLOAD DESCRIPTION</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. vintage vinyl record collection"
              className="input"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <SliderRow
              label="WEIGHT"
              unit="KG"
              min={0.1}
              max={50}
              step={0.1}
              value={form.weightKg}
              onChange={(n) => setForm({ ...form, weightKg: n })}
            />
            <SliderRow
              label="VOLUME"
              unit="L"
              min={1}
              max={200}
              step={1}
              value={form.volumeLitres}
              onChange={(n) => setForm({ ...form, volumeLitres: n })}
            />
            <SliderRow
              label="BUDGET"
              unit="SOL"
              min={0.01}
              max={Math.max(5, Math.ceil((balanceSol ?? 5) * 1.2))}
              step={0.01}
              value={form.maxBudgetSol}
              onChange={(n) => setForm({ ...form, maxBudgetSol: n })}
              valueTextClass={
                overBudget
                  ? "text-[var(--color-blood)]"
                  : "text-[var(--color-bone)]"
              }
              labelClass={overBudget ? "label text-[var(--color-blood)]" : "label"}
              warning={
                overBudget && balanceSol !== null
                  ? `Budget exceeds wallet balance of ${balanceSol.toFixed(4)} SOL`
                  : null
              }
            />
          </div>

          <LocationPicker
            origin={{ lat: form.originLat, lng: form.originLng }}
            destination={{ lat: form.destLat, lng: form.destLng }}
            onChange={({ origin, destination }) =>
              setForm((f) => ({
                ...f,
                originLat: origin.lat,
                originLng: origin.lng,
                destLat: destination.lat,
                destLng: destination.lng,
              }))
            }
          />

          <div className="flex items-center gap-4 pt-2 border-t border-[var(--color-line)]">
            <button
              type="submit"
              disabled={
                submitting || !form.description || !connected || overBudget
              }
              className="btn-primary"
            >
              {submitting
                ? PHASE_LABEL[phase.kind] ?? "WORKING…"
                : "▸ DISPATCH ORDER"}
            </button>
            <span
              className={`text-[10px] tracking-[0.12em] uppercase font-semibold ${
                overBudget
                  ? "text-[var(--color-blood)]"
                  : "text-[var(--color-steel)]"
              }`}
            >
              {form.maxBudgetSol} SOL WILL BE LOCKED IN ESCROW PDA
            </span>
          </div>

          {phase.kind === "done" && (
            <div className="text-[11px] p-3 border border-[var(--color-phosphor)] bg-[var(--color-phosphor-dim)] text-[var(--color-bone)]">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-semibold">
                  ◉ DELIVERED ▸ {shortenPubkey(phase.result.packageId)}
                </span>
                <span className="flex items-center gap-3">
                  <a
                    href={phase.result.listTxUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-phosphor)] hover:underline"
                  >
                    LIST TX ↗
                  </a>
                  <a
                    href={phase.result.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-phosphor)] hover:underline"
                  >
                    PACKAGE ↗
                  </a>
                  <button
                    type="button"
                    onClick={reset}
                    className="text-[var(--color-ash)] hover:text-[var(--color-bone)]"
                  >
                    ×
                  </button>
                </span>
              </div>
            </div>
          )}

          {phase.kind === "error" && (
            <div className="text-[11px] p-3 border border-[var(--color-blood)] text-[var(--color-bone)]">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="text-[var(--color-blood)] font-bold mr-2">✕</span>
                  {phase.message}
                </span>
                <button
                  type="button"
                  onClick={reset}
                  className="text-[var(--color-ash)] hover:text-[var(--color-bone)]"
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </form>
      </Panel>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "AVG SETTLEMENT", value: "<2s", note: "ON-CHAIN" },
          { label: "SWARM FORMATION", value: "<15s", note: "MULTI-AGENT" },
          { label: "PROTOCOL FEE", value: "0%", note: "DURING BETA" },
        ].map((item) => (
          <div key={item.label} className="panel p-4">
            <div className="label mb-2">{item.label}</div>
            <div className="stat-num-sm text-[var(--color-phosphor)]">
              {item.value}
            </div>
            <div className="text-[9px] text-[var(--color-steel)] mt-1 tracking-[0.14em] font-semibold uppercase">
              {item.note}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
