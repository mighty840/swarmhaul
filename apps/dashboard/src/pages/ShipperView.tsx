import { useState } from "react";
import { postPackage } from "../hooks/useSwarm.js";

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
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const pkg = await postPackage({
        ...form,
        shipperPubkey: "demo-shipper", // TODO: wallet adapter
      });
      setResult(`Package listed: ${pkg.id}`);
      setForm((f) => ({ ...f, description: "" }));
    } catch (err) {
      setResult(`Error: ${err}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-lg font-bold mb-4">Ship a Package</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Description</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
            placeholder="Books, electronics, food..."
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Weight (kg)</label>
            <input
              type="number"
              step="0.1"
              value={form.weightKg}
              onChange={(e) => setForm({ ...form, weightKg: +e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Volume (L)</label>
            <input
              type="number"
              step="0.1"
              value={form.volumeLitres}
              onChange={(e) => setForm({ ...form, volumeLitres: +e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Budget (SOL)</label>
            <input
              type="number"
              step="0.01"
              value={form.maxBudgetSol}
              onChange={(e) => setForm({ ...form, maxBudgetSol: +e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Origin (lat, lng)</label>
            <div className="flex gap-1">
              <input
                type="number"
                step="0.001"
                value={form.originLat}
                onChange={(e) => setForm({ ...form, originLat: +e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-2 text-xs focus:border-purple-500 focus:outline-none"
              />
              <input
                type="number"
                step="0.001"
                value={form.originLng}
                onChange={(e) => setForm({ ...form, originLng: +e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-2 text-xs focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Destination (lat, lng)</label>
            <div className="flex gap-1">
              <input
                type="number"
                step="0.001"
                value={form.destLat}
                onChange={(e) => setForm({ ...form, destLat: +e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-2 text-xs focus:border-purple-500 focus:outline-none"
              />
              <input
                type="number"
                step="0.001"
                value={form.destLng}
                onChange={(e) => setForm({ ...form, destLng: +e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-2 text-xs focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || !form.description}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 px-4 py-2.5 rounded text-sm font-medium transition-colors"
        >
          {submitting ? "Listing..." : "List Package"}
        </button>

        {result && (
          <div
            className={`text-xs p-2 rounded ${
              result.startsWith("Error")
                ? "bg-red-500/10 text-red-400"
                : "bg-emerald-500/10 text-emerald-400"
            }`}
          >
            {result}
          </div>
        )}
      </form>
    </div>
  );
}
