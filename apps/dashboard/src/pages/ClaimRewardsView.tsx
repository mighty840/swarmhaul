import { useCallback, useEffect, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// ── Window boundaries (must match server) ────────────────────────────────────
const WINDOW_OPEN  = new Date("2026-05-11T00:00:00.000Z");
const WINDOW_CLOSE = new Date("2026-05-17T23:59:59.999Z");

type WindowStatus = "before" | "open" | "closed";

function getWindowStatus(now: Date): WindowStatus {
  if (now < WINDOW_OPEN)  return "before";
  if (now > WINDOW_CLOSE) return "closed";
  return "open";
}

// ── Countdown helpers ─────────────────────────────────────────────────────────
interface Countdown { days: number; hours: number; minutes: number; seconds: number }

function getCountdown(target: Date, now: Date): Countdown {
  const diff = Math.max(0, target.getTime() - now.getTime());
  const totalSec = Math.floor(diff / 1000);
  return {
    days:    Math.floor(totalSec / 86400),
    hours:   Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

function pad2(n: number) { return String(n).padStart(2, "0"); }

// ── Pubkey validation (base58, Solana-length) ─────────────────────────────────
function isValidPubkey(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());
}

// ── Digit tile ────────────────────────────────────────────────────────────────
function DigitTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="flex items-center justify-center tabular-nums font-mono font-bold"
        style={{
          width: "clamp(44px, 15vw, 64px)",
          height: "clamp(44px, 15vw, 64px)",
          fontSize: "clamp(20px, 6vw, 32px)",
          color: "var(--color-amber)",
          border: "1px solid var(--color-amber)",
          background: "rgba(255,170,0,0.07)",
          boxShadow: "0 0 18px rgba(255,170,0,0.15)",
          letterSpacing: "0.04em",
        }}
      >
        {value}
      </div>
      <span className="text-[8px] tracking-[0.2em] text-[var(--color-steel)] font-semibold">
        {label}
      </span>
    </div>
  );
}

// ── Separator ─────────────────────────────────────────────────────────────────
function Sep() {
  return (
    <span
      className="text-[32px] font-thin tabular-nums mb-5 select-none"
      style={{ color: "rgba(255,170,0,0.35)", lineHeight: 1 }}
    >
      :
    </span>
  );
}

// ── Earnings display ──────────────────────────────────────────────────────────
function lamportsToSol(l: bigint | number | string): string {
  return (Number(l) / 1_000_000_000).toFixed(6);
}

interface ClaimRecord {
  id: string;
  devnetPubkey: string;
  mainnetPubkey: string;
  devnetEarningsLamports: string;
  claimedAt: string;
  status: string;
}

interface EarningsPreview { lamports: bigint; loaded: boolean }

export function ClaimRewardsView() {
  const [now, setNow] = useState(() => new Date());
  const [windowStatus, setWindowStatus] = useState<WindowStatus>(() => getWindowStatus(new Date()));
  const [totalClaims, setTotalClaims] = useState<number | null>(null);

  // Form state
  const [devnetPubkey,  setDevnetPubkey]  = useState("");
  const [mainnetPubkey, setMainnetPubkey] = useState("");
  const [earnings, setEarnings] = useState<EarningsPreview>({ lamports: 0n, loaded: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [claimed, setClaimed] = useState<ClaimRecord | null>(null);

  const earningsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live clock tick
  useEffect(() => {
    const id = setInterval(() => {
      const t = new Date();
      setNow(t);
      setWindowStatus(getWindowStatus(t));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Poll claim count every 30s
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await fetch(`${API}/reward-claims/window`);
        if (res.ok) {
          const data = await res.json() as { totalClaims: number };
          setTotalClaims(data.totalClaims);
        }
      } catch { /* silent */ }
    };
    void fetchCount();
    const id = setInterval(fetchCount, 30_000);
    return () => clearInterval(id);
  }, []);

  // Lookup earnings when devnet pubkey is valid
  const lookupEarnings = useCallback(async (pk: string) => {
    if (!isValidPubkey(pk)) { setEarnings({ lamports: 0n, loaded: false }); return; }
    try {
      const res = await fetch(`${API}/reward-claims/my?devnetPubkey=${encodeURIComponent(pk)}`);
      if (res.status === 404) {
        // Not yet claimed — look up raw earnings from leg data
        const legRes = await fetch(`${API}/digital-tasks`);
        if (!legRes.ok) { setEarnings({ lamports: 0n, loaded: true }); return; }
        const tasks = await legRes.json() as Array<{ legs: Array<{ agentPubkey?: string; paymentLamports?: string; status: string }> }>;
        let total = 0n;
        for (const task of tasks) {
          for (const leg of task.legs) {
            if (leg.agentPubkey === pk && leg.status === "completed" && leg.paymentLamports) {
              total += BigInt(leg.paymentLamports);
            }
          }
        }
        setEarnings({ lamports: total, loaded: true });
      } else if (res.ok) {
        const data = await res.json() as ClaimRecord;
        setClaimed(data);
      }
    } catch {
      setEarnings({ lamports: 0n, loaded: true });
    }
  }, []);

  // Debounce earnings lookup
  useEffect(() => {
    if (earningsTimer.current) clearTimeout(earningsTimer.current);
    earningsTimer.current = setTimeout(() => lookupEarnings(devnetPubkey), 600);
    return () => { if (earningsTimer.current) clearTimeout(earningsTimer.current); };
  }, [devnetPubkey, lookupEarnings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidPubkey(devnetPubkey))  { setError("Invalid devnet pubkey"); return; }
    if (!isValidPubkey(mainnetPubkey)) { setError("Invalid mainnet pubkey"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/reward-claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devnetPubkey: devnetPubkey.trim(), mainnetPubkey: mainnetPubkey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.claim) { setClaimed(data.claim); return; }
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setClaimed(data as ClaimRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const countdown = getCountdown(
    windowStatus === "before" ? WINDOW_OPEN : WINDOW_CLOSE,
    now,
  );

  // ── Already claimed view ─────────────────────────────────────────────────
  if (claimed) {
    const sol = lamportsToSol(claimed.devnetEarningsLamports);
    return (
      <div className="max-w-xl mx-auto pt-8 space-y-6">
        <ClaimHeader />
        <div
          className="border p-6 space-y-5"
          style={{ borderColor: "var(--color-phosphor)", background: "rgba(0,212,60,0.04)" }}
        >
          <div className="flex items-center gap-3">
            <span className="text-[22px]" style={{ color: "var(--color-phosphor)" }}>◉</span>
            <div>
              <div className="text-[11px] font-bold tracking-[0.18em] text-[var(--color-phosphor)]">
                CLAIM REGISTERED
              </div>
              <div className="text-[9px] text-[var(--color-steel)] mt-0.5">
                Registered {new Date(claimed.claimedAt).toUTCString()}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <PubkeyField label="DEVNET AGENT"  value={claimed.devnetPubkey} />
            <PubkeyField label="MAINNET PAYOUT" value={claimed.mainnetPubkey} />
          </div>

          <div
            className="flex items-baseline gap-2 px-4 py-3 border"
            style={{ borderColor: "var(--color-amber)", background: "rgba(255,170,0,0.06)" }}
          >
            <span className="text-[26px] font-bold tabular-nums" style={{ color: "var(--color-amber)" }}>
              {sol}
            </span>
            <span className="text-[11px] font-semibold tracking-[0.14em] text-[var(--color-ash)]">SOL</span>
            <span className="text-[9px] text-[var(--color-steel)] ml-auto">DEVNET EARNINGS ON RECORD</span>
          </div>

          <StatusBadge status={claimed.status} />

          <p className="text-[10px] text-[var(--color-ash)] leading-relaxed border-t border-[var(--color-line)] pt-4">
            Sharang will distribute the equivalent SOL to your mainnet wallet after the claim window
            closes on <strong className="text-[var(--color-bone)]">17 May 2026 23:59 UTC</strong>.
            You don't need to do anything else — just watch your mainnet wallet.
          </p>
        </div>
      </div>
    );
  }

  // ── Window closed ────────────────────────────────────────────────────────
  if (windowStatus === "closed") {
    return (
      <div className="max-w-xl mx-auto pt-8 space-y-6">
        <ClaimHeader />
        <div className="border border-[var(--color-line)] bg-[var(--color-graphite)] p-8 text-center space-y-4">
          <div className="text-[40px] select-none">■</div>
          <div className="text-[13px] font-bold tracking-[0.18em] text-[var(--color-steel)]">
            CLAIM WINDOW CLOSED
          </div>
          <p className="text-[10px] text-[var(--color-ash)] leading-relaxed max-w-sm mx-auto">
            The registration window ran 11 – 17 May 2026. If you submitted a claim
            during that time, check your mainnet wallet — payouts are processed after the deadline.
          </p>
          <p className="text-[9px] text-[var(--color-steel)]">
            Questions? Reach out to{" "}
            <a
              href="https://sharang.meghsakha.com"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--color-cyan)] hover:underline"
            >
              Sharang Parnerkar
            </a>
          </p>
        </div>
      </div>
    );
  }

  // ── Before window — countdown ────────────────────────────────────────────
  if (windowStatus === "before") {
    return (
      <div className="max-w-xl mx-auto pt-8 space-y-6">
        <ClaimHeader />

        <div className="border border-[var(--color-line)] bg-[var(--color-graphite)] px-4 sm:px-8 py-6 sm:py-10 space-y-8">
          <div className="text-center space-y-2">
            <div className="text-[9px] font-bold tracking-[0.22em] text-[var(--color-amber)] uppercase">
              Claim window opens in
            </div>
            <div className="flex items-end justify-center gap-2 mt-4">
              <DigitTile value={String(countdown.days)}    label="DAYS" />
              <Sep />
              <DigitTile value={pad2(countdown.hours)}   label="HRS" />
              <Sep />
              <DigitTile value={pad2(countdown.minutes)} label="MIN" />
              <Sep />
              <DigitTile value={pad2(countdown.seconds)} label="SEC" />
            </div>
          </div>

          <div className="border-t border-[var(--color-line)] pt-6 space-y-3">
            <div className="text-[10px] font-bold tracking-[0.16em] text-[var(--color-bone)]">
              HOW IT WORKS
            </div>
            <ol className="space-y-2">
              {[
                "Participate in the SWARM hackathon on Solana devnet — earn SOL by completing digital task legs as an AI agent.",
                "Return here between 11 – 17 May 2026 and register your devnet agent pubkey + a mainnet wallet.",
                "After the window closes, the equivalent SOL is sent to your mainnet wallet by Sharang — no fees, no custody.",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-[10px] text-[var(--color-ash)] leading-relaxed">
                  <span className="font-bold shrink-0 tabular-nums" style={{ color: "var(--color-amber)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <div
            className="border px-4 py-3 text-[9px] text-[var(--color-ash)] leading-relaxed"
            style={{ borderColor: "rgba(255,170,0,0.3)", background: "rgba(255,170,0,0.04)" }}
          >
            <span className="text-[var(--color-amber)] font-bold mr-2">ⓘ</span>
            All hackathon transactions run on Solana devnet (test tokens, zero real-world value).
            The mainnet payout is a voluntary reward from the organiser — not a financial service,
            not a custodial arrangement. Participation in the hackathon constitutes acceptance of
            these terms.
          </div>

          {totalClaims !== null && (
            <ClaimsTicker count={totalClaims} />
          )}
        </div>
      </div>
    );
  }

  // ── Open window — claim form ─────────────────────────────────────────────
  const earningsReady = earnings.loaded;
  const earningsSol   = lamportsToSol(earnings.lamports);
  const canSubmit = !submitting && isValidPubkey(devnetPubkey) && isValidPubkey(mainnetPubkey);

  const closesIn = getCountdown(WINDOW_CLOSE, now);

  return (
    <div className="max-w-xl mx-auto pt-8 space-y-6">
      <ClaimHeader />

      {/* Window-open countdown strip */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border"
        style={{ borderColor: "var(--color-amber)", background: "rgba(255,170,0,0.06)" }}
      >
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--color-amber)", boxShadow: "0 0 6px var(--color-amber)" }} />
          <span className="text-[9px] font-bold tracking-[0.18em] text-[var(--color-amber)]">
            CLAIM WINDOW OPEN
          </span>
        </div>
        <div className="flex items-center gap-4">
          {totalClaims !== null && (
            <span className="text-[9px] tabular-nums font-mono" style={{ color: "var(--color-amber)" }}>
              {totalClaims} CLAIM{totalClaims !== 1 ? "S" : ""} REGISTERED
            </span>
          )}
          <div className="text-[9px] tabular-nums text-[var(--color-ash)] font-mono">
            CLOSES IN {closesIn.days}d {pad2(closesIn.hours)}h {pad2(closesIn.minutes)}m {pad2(closesIn.seconds)}s
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border border-[var(--color-line)] bg-[var(--color-graphite)] p-6 space-y-6">
        {/* Devnet pubkey */}
        <div>
          <label className="label block mb-1.5">
            DEVNET AGENT PUBKEY
            <span className="ml-2 text-[var(--color-steel)] normal-case tracking-normal font-normal text-[9px]">
              the wallet your AI agent used on devnet
            </span>
          </label>
          <input
            className="input w-full font-mono"
            value={devnetPubkey}
            onChange={(e) => { setDevnetPubkey(e.target.value); setClaimed(null); setError(null); }}
            placeholder="Base58 pubkey — e.g. 7FBqQR…"
            spellCheck={false}
            disabled={submitting}
          />
          {devnetPubkey && !isValidPubkey(devnetPubkey) && (
            <div className="mt-1 text-[9px]" style={{ color: "var(--color-blood)" }}>
              Not a valid Solana pubkey
            </div>
          )}
          {earningsReady && isValidPubkey(devnetPubkey) && (
            <div className="mt-2 flex items-baseline gap-2 text-[10px]">
              <span className="text-[var(--color-ash)]">Devnet earnings on record:</span>
              <span className="font-bold tabular-nums" style={{ color: earnings.lamports > 0n ? "var(--color-amber)" : "var(--color-steel)" }}>
                {earningsSol} SOL
              </span>
              {earnings.lamports === 0n && (
                <span className="text-[9px] text-[var(--color-steel)]">(no completed legs found)</span>
              )}
            </div>
          )}
        </div>

        {/* Mainnet pubkey */}
        <div>
          <label className="label block mb-1.5">
            MAINNET PAYOUT WALLET
            <span className="ml-2 text-[var(--color-steel)] normal-case tracking-normal font-normal text-[9px]">
              where your SOL reward will be sent — double-check this
            </span>
          </label>
          <input
            className="input w-full font-mono"
            value={mainnetPubkey}
            onChange={(e) => { setMainnetPubkey(e.target.value); setError(null); }}
            placeholder="Base58 mainnet pubkey"
            spellCheck={false}
            disabled={submitting}
          />
          {mainnetPubkey && !isValidPubkey(mainnetPubkey) && (
            <div className="mt-1 text-[9px]" style={{ color: "var(--color-blood)" }}>
              Not a valid Solana pubkey
            </div>
          )}
          <div className="mt-1.5 text-[9px] text-[var(--color-steel)] leading-relaxed">
            ⚠ Rewards are sent manually — if this address is wrong there is no way to recover the funds.
          </div>
        </div>

        {/* Legal note */}
        <div
          className="px-4 py-3 border text-[9px] text-[var(--color-ash)] leading-relaxed"
          style={{ borderColor: "rgba(255,170,0,0.25)", background: "rgba(255,170,0,0.04)" }}
        >
          <span className="text-[var(--color-amber)] font-bold mr-1.5">ⓘ</span>
          All hackathon activity runs on Solana devnet (testnet tokens, no real-world value).
          The mainnet payout is a voluntary, one-time reward from the hackathon organiser.
          This is not a financial product, not an investment, and not a promise of profit.
          You are not our customer; we are not your custodian.
        </div>

        {error && (
          <div className="text-[10px] p-3 border border-[var(--color-blood)] text-[var(--color-bone)]">
            <span className="text-[var(--color-blood)] font-bold mr-2">✕</span>{error}
          </div>
        )}

        <div className="flex items-center gap-4 pt-2 border-t border-[var(--color-line)]">
          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-primary"
            style={canSubmit ? { borderColor: "var(--color-amber)", color: "var(--color-amber)" } : undefined}
          >
            {submitting ? "REGISTERING…" : "▸ REGISTER CLAIM"}
          </button>
          <span className="text-[9px] text-[var(--color-steel)] tracking-[0.12em]">
            ONE CLAIM PER DEVNET PUBKEY
          </span>
        </div>
      </form>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function ClaimHeader() {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <div
          className="w-1 h-5"
          style={{ backgroundColor: "var(--color-amber)", boxShadow: "0 0 8px var(--color-amber)" }}
        />
        <h1 className="text-[13px] font-bold tracking-[0.18em] text-[var(--color-bone)]">
          MAINNET REWARD CLAIM
        </h1>
        <div
          className="px-2 py-0.5 text-[8px] font-bold tracking-[0.16em] border"
          style={{ borderColor: "var(--color-amber)", color: "var(--color-amber)" }}
        >
          HACKATHON 2026
        </div>
      </div>
      <p className="text-[10px] text-[var(--color-steel)] leading-relaxed pl-4">
        Devnet earnings → Mainnet SOL. Register once. Paid out after 17 May 2026.
      </p>
    </div>
  );
}

function PubkeyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label-muted mb-1">{label}</div>
      <div className="font-mono text-[10px] text-[var(--color-bone)] truncate" title={value}>
        {value.slice(0, 8)}··{value.slice(-6)}
      </div>
    </div>
  );
}

function ClaimsTicker({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-center gap-2 py-2 border-t border-[var(--color-line)]">
      <span
        className="w-1.5 h-1.5 rounded-full animate-pulse"
        style={{ backgroundColor: "var(--color-amber)" }}
      />
      <span className="text-[9px] tabular-nums font-mono font-semibold tracking-[0.14em]" style={{ color: "var(--color-amber)" }}>
        {count}
      </span>
      <span className="text-[9px] tracking-[0.12em] text-[var(--color-steel)] uppercase">
        claim{count !== 1 ? "s" : ""} registered so far
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isPaid = status === "paid";
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 border text-[9px] font-bold tracking-[0.16em]"
      style={{
        borderColor: isPaid ? "var(--color-phosphor)" : "var(--color-amber)",
        color:       isPaid ? "var(--color-phosphor)" : "var(--color-amber)",
        background:  isPaid ? "rgba(0,212,60,0.06)" : "rgba(255,170,0,0.06)",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: isPaid ? "var(--color-phosphor)" : "var(--color-amber)" }}
      />
      {isPaid ? "PAID" : "PENDING PAYOUT"}
    </div>
  );
}
