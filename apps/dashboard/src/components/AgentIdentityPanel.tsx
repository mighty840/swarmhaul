import { useEffect, useState } from "react";

/**
 * Agent identity panel — modal that surfaces the DID + Verifiable
 * Credential for a given agent pubkey. Hits three API endpoints:
 *
 *   GET  /did/:pubkey                → DID Document
 *   GET  /did/:pubkey/reputation     → VC-JWT envelope
 *   POST /did/verify                 → verify the VC-JWT
 *
 * Decodes the VC-JWT payload inline so visitors can see the claims
 * without running their own tooling. Verification runs on the API
 * (same endpoint any third party would call) so the "valid ✓" badge
 * is exactly the signal a downstream integration would receive.
 */
const API_URL =
  import.meta.env.VITE_API_URL ?? "https://api.swarmhaul.defited.com";
const EXPLORER_BASE = "https://explorer.solana.com";

export interface AgentIdentityPanelProps {
  pubkey: string | null;
  onClose: () => void;
}

interface DidDocument {
  id: string;
  verificationMethod: Array<{ publicKeyMultibase: string }>;
  service?: Array<{ serviceEndpoint: string }>;
}

interface VcPayload {
  iss: string;
  sub: string;
  iat: number;
  exp?: number;
  vc: {
    type: string[];
    issuanceDate: string;
    credentialSubject: {
      id: string;
      legsAccepted: number;
      legsCompleted: number;
      reliabilityScore: number;
      onChainPDA: string;
      mirroredAt: string;
    };
  };
}

interface VerifyResponse {
  valid: boolean;
  reason?: string;
  expired?: boolean;
}

function decodeJwtPayload(jwt: string): VcPayload | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as VcPayload;
  } catch {
    return null;
  }
}

function shorten(s: string, head = 8, tail = 6): string {
  if (s.length <= head + tail + 2) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          /* clipboard API unavailable — caller's text is still select-all */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      aria-label={label ? `Copy ${label}` : "Copy"}
      className="text-[9px] tracking-[0.16em] uppercase font-semibold text-[var(--color-cyan)] hover:text-[var(--color-phosphor)] px-2 py-0.5 border border-[var(--color-line-hot)] hover:border-[var(--color-cyan)] transition-colors"
    >
      {copied ? "COPIED ✓" : "COPY"}
    </button>
  );
}

export function AgentIdentityPanel({ pubkey, onClose }: AgentIdentityPanelProps) {
  const [didDoc, setDidDoc] = useState<DidDocument | null>(null);
  const [jwt, setJwt] = useState<string | null>(null);
  const [vcPayload, setVcPayload] = useState<VcPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyResponse | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  useEffect(() => {
    if (!pubkey) return;
    setLoading(true);
    setError(null);
    setDidDoc(null);
    setJwt(null);
    setVcPayload(null);
    setVerify(null);
    (async () => {
      try {
        const [docRes, vcRes] = await Promise.all([
          fetch(`${API_URL}/did/${pubkey}`),
          fetch(`${API_URL}/did/${pubkey}/reputation`),
        ]);
        if (!docRes.ok) throw new Error(`/did/${pubkey} → ${docRes.status}`);
        setDidDoc(await docRes.json());
        if (vcRes.ok) {
          const body = (await vcRes.json()) as { jwt: string };
          setJwt(body.jwt);
          setVcPayload(decodeJwtPayload(body.jwt));
        } else if (vcRes.status !== 404) {
          throw new Error(`/did/${pubkey}/reputation → ${vcRes.status}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [pubkey]);

  if (!pubkey) return null;

  const did = `did:swarmhaul:${pubkey}`;
  const claims = vcPayload?.vc.credentialSubject;
  const onChainPda = claims?.onChainPDA;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-[rgba(6,6,10,0.82)] backdrop-blur-sm p-4 md:p-8"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="w-full max-w-3xl border border-[var(--color-line)] bg-[var(--color-graphite)] shadow-[0_0_0_1px_var(--color-line-hot),0_24px_48px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-elevated)] px-4 py-2.5">
          <div className="text-[10px] tracking-[0.18em] font-semibold uppercase text-[var(--color-cyan)]">
            ▸ AGENT IDENTITY ── DID + VC
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--color-ash)] hover:text-[var(--color-bone)] text-[14px] leading-none px-2"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* DID string + copy */}
          <section>
            <div className="flex items-center justify-between mb-2 gap-3">
              <div className="text-[9px] tracking-[0.16em] uppercase font-semibold text-[var(--color-ash)]">
                ▸ DID
              </div>
              <CopyButton value={did} label="DID" />
            </div>
            <code className="block font-mono text-[11px] text-[var(--color-phosphor)] break-all select-all border border-[var(--color-line)] bg-[var(--color-void)] px-3 py-2">
              {did}
            </code>
          </section>

          {/* Live claims (from the VC) */}
          {claims && (
            <section>
              <div className="text-[9px] tracking-[0.16em] uppercase font-semibold text-[var(--color-ash)] mb-2">
                ▸ REPUTATION CLAIMS (on-chain, mirrored at{" "}
                {new Date(claims.mirroredAt).toLocaleTimeString()})
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "LEGS ACCEPTED", value: claims.legsAccepted },
                  { label: "LEGS COMPLETED", value: claims.legsCompleted },
                  {
                    label: "RELIABILITY",
                    value: `${claims.reliabilityScore}/100`,
                  },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="border border-[var(--color-line)] bg-[var(--color-void)] p-3"
                  >
                    <div className="text-[8px] tracking-[0.16em] font-bold text-[var(--color-steel)] mb-1">
                      {c.label}
                    </div>
                    <div className="text-[18px] font-light tabular-nums text-[var(--color-phosphor)]">
                      {c.value}
                    </div>
                  </div>
                ))}
              </div>
              {onChainPda && (
                <div className="mt-2 text-[10px] text-[var(--color-steel)]">
                  on-chain PDA:{" "}
                  <a
                    href={`${EXPLORER_BASE}/address/${onChainPda}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-cyan)] hover:underline font-mono"
                  >
                    {shorten(onChainPda)} ↗
                  </a>
                </div>
              )}
            </section>
          )}

          {/* DID Document */}
          {didDoc && (
            <section>
              <div className="flex items-center justify-between mb-2 gap-3">
                <div className="text-[9px] tracking-[0.16em] uppercase font-semibold text-[var(--color-ash)]">
                  ▸ DID DOCUMENT
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`${API_URL}/did/${pubkey}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[9px] tracking-[0.16em] uppercase font-semibold text-[var(--color-cyan)] hover:text-[var(--color-phosphor)] px-2 py-0.5 border border-[var(--color-line-hot)] hover:border-[var(--color-cyan)] transition-colors"
                  >
                    RAW ↗
                  </a>
                  <CopyButton
                    value={JSON.stringify(didDoc, null, 2)}
                    label="DID Document"
                  />
                </div>
              </div>
              <pre className="border border-[var(--color-line)] bg-[var(--color-void)] p-3 text-[10px] font-mono text-[var(--color-bone)] leading-snug overflow-x-auto max-h-[200px]">
                {JSON.stringify(didDoc, null, 2)}
              </pre>
            </section>
          )}

          {/* VC-JWT */}
          {jwt && vcPayload && (
            <section>
              <div className="flex items-center justify-between mb-2 gap-3">
                <div className="text-[9px] tracking-[0.16em] uppercase font-semibold text-[var(--color-ash)]">
                  ▸ VERIFIABLE CREDENTIAL ── VC-JWT
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`${API_URL}/did/${pubkey}/reputation`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[9px] tracking-[0.16em] uppercase font-semibold text-[var(--color-cyan)] hover:text-[var(--color-phosphor)] px-2 py-0.5 border border-[var(--color-line-hot)] hover:border-[var(--color-cyan)] transition-colors"
                  >
                    RAW ↗
                  </a>
                  <CopyButton value={jwt} label="VC-JWT" />
                </div>
              </div>
              <div className="border border-[var(--color-line)] bg-[var(--color-void)] px-3 py-2 font-mono text-[10px] text-[var(--color-steel)] break-all select-all">
                {shorten(jwt, 32, 12)}
              </div>
              <div className="mt-2 text-[10px] text-[var(--color-steel)]">
                Issued by{" "}
                <span className="text-[var(--color-cyan)]">
                  {shorten(vcPayload.iss.replace("did:swarmhaul:", ""))}
                </span>
                {" "}at{" "}
                {new Date(vcPayload.iat * 1000).toLocaleString()}.
                {vcPayload.exp && (
                  <> Expires{" "}
                    <span className="text-[var(--color-bone)]">
                      {new Date(vcPayload.exp * 1000).toLocaleString()}
                    </span>.
                  </>
                )}{" "}
                Type:{" "}
                <code className="text-[var(--color-bone)]">
                  {vcPayload.vc.type.join(" · ")}
                </code>
              </div>
            </section>
          )}

          {/* Verify */}
          {jwt && (
            <section>
              <div className="flex items-center justify-between gap-3">
                <div className="text-[9px] tracking-[0.16em] uppercase font-semibold text-[var(--color-ash)]">
                  ▸ VERIFY
                </div>
                <button
                  disabled={verifying}
                  onClick={async () => {
                    setVerifying(true);
                    try {
                      const res = await fetch(`${API_URL}/did/verify`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ jwt }),
                      });
                      setVerify((await res.json()) as VerifyResponse);
                    } catch (err) {
                      setVerify({
                        valid: false,
                        reason: err instanceof Error ? err.message : String(err),
                      });
                    } finally {
                      setVerifying(false);
                    }
                  }}
                  className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[var(--color-void)] bg-[var(--color-phosphor)] hover:bg-[#33ffb0] disabled:opacity-60 px-3 py-1 border border-[var(--color-phosphor)] transition-colors"
                >
                  {verifying ? "VERIFYING…" : "▸ POST /did/verify"}
                </button>
              </div>
              {verify && (
                <div
                  className="mt-2 border px-3 py-2 text-[11px]"
                  style={{
                    borderColor: verify.valid
                      ? "var(--color-phosphor)"
                      : "var(--color-blood)",
                    color: verify.valid
                      ? "var(--color-phosphor)"
                      : "var(--color-blood)",
                    background: "var(--color-void)",
                  }}
                >
                  {verify.valid
                    ? "✓ signature valid — issuer pubkey matches coordinator DID"
                    : verify.expired
                      ? "✗ credential expired — fetch a fresh VC from the reputation endpoint"
                      : `✗ verification failed: ${verify.reason ?? "unknown"}`}
                </div>
              )}
            </section>
          )}

          {loading && (
            <div className="text-[11px] text-[var(--color-ash)] animate-pulse">
              fetching DID + VC…
            </div>
          )}
          {error && (
            <div className="text-[11px] text-[var(--color-blood)]">
              {error}
            </div>
          )}
          {!loading && !didDoc && !error && (
            <div className="text-[11px] text-[var(--color-steel)]">
              This agent has no reputation record yet, so no VC is available.
              Once they land their first <code>assign_leg</code>, a DID
              Document appears immediately and a reputation VC is issued on
              the first <code>confirm_leg</code>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
