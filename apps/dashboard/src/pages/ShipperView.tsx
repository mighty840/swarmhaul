import { useState } from "react";
import { postPackage } from "../hooks/useSwarm.js";
import { Panel } from "../components/Panel.js";

export function ShipperView() {
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
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const pkg = await postPackage({
        ...form,
        shipperPubkey: "demo-shipper",
      });
      setResult({ ok: true, msg: `Package dispatched ▸ ${pkg.id}` });
      setForm((f) => ({ ...f, description: "" }));
    } catch (err) {
      setResult({ ok: false, msg: `Error: ${err}` });
    } finally {
      setSubmitting(false);
    }
  };

  const Input = ({
    label,
    value,
    onChange,
    type = "text",
    step,
    placeholder,
  }: {
    label: string;
    value: string | number;
    onChange: (v: string) => void;
    type?: string;
    step?: string;
    placeholder?: string;
  }) => (
    <div>
      <label className="block label mb-2">{label}</label>
      <input
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input"
      />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5 glitch-in">
      <div className="border-b border-[var(--color-line)] pb-4">
        <div className="label mb-2">▸ DISPATCH TERMINAL</div>
        <h1 className="text-[32px] leading-none tracking-[-0.02em] font-light text-[var(--color-bone)]">
          <span className="display-serif text-[var(--color-magenta)]">Post</span> a Task
        </h1>
        <p className="text-[12px] text-[var(--color-steel)] mt-3 max-w-lg leading-relaxed">
          List a package for autonomous agent fulfillment. Bids arrive within
          seconds. Funds escrow in a Solana PDA vault until each leg is
          confirmed on-chain.
        </p>
      </div>

      <Panel title="NEW DISPATCH ORDER" accent="magenta">
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
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

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block label mb-2">WEIGHT ── KG</label>
              <input
                type="number"
                step="0.1"
                value={form.weightKg}
                onChange={(e) => setForm({ ...form, weightKg: +e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block label mb-2">VOLUME ── L</label>
              <input
                type="number"
                step="0.1"
                value={form.volumeLitres}
                onChange={(e) => setForm({ ...form, volumeLitres: +e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block label mb-2">BUDGET ── SOL</label>
              <input
                type="number"
                step="0.01"
                value={form.maxBudgetSol}
                onChange={(e) => setForm({ ...form, maxBudgetSol: +e.target.value })}
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block label mb-2">ORIGIN ── LAT, LNG</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.001"
                  value={form.originLat}
                  onChange={(e) =>
                    setForm({ ...form, originLat: +e.target.value })
                  }
                  className="input"
                />
                <input
                  type="number"
                  step="0.001"
                  value={form.originLng}
                  onChange={(e) =>
                    setForm({ ...form, originLng: +e.target.value })
                  }
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="block label mb-2">DESTINATION ── LAT, LNG</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.001"
                  value={form.destLat}
                  onChange={(e) => setForm({ ...form, destLat: +e.target.value })}
                  className="input"
                />
                <input
                  type="number"
                  step="0.001"
                  value={form.destLng}
                  onChange={(e) => setForm({ ...form, destLng: +e.target.value })}
                  className="input"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2 border-t border-[var(--color-line)]">
            <button
              type="submit"
              disabled={submitting || !form.description}
              className="btn-primary"
            >
              {submitting ? "DISPATCHING…" : "▸ DISPATCH ORDER"}
            </button>
            <span className="text-[10px] text-[var(--color-steel)] tracking-[0.12em] uppercase font-semibold">
              {form.maxBudgetSol} SOL WILL BE LOCKED IN ESCROW PDA
            </span>
          </div>

          {result && (
            <div
              className={`text-[11px] p-3 border ${
                result.ok
                  ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor-dim)] text-[var(--color-phosphor)]"
                  : "border-[var(--color-blood)] text-[var(--color-blood)]"
              }`}
            >
              {result.ok ? "◉ " : "✕ "} {result.msg}
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
          <div
            key={item.label}
            className="panel p-4"
          >
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
