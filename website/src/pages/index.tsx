import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";

export default function Home(): JSX.Element {
  return (
    <Layout
      title="SwarmHaul Docs"
      description="Multi-agent coordination protocol on Solana — protocol docs, MCP integration, update log."
    >
      <main
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "4rem 1.5rem 6rem",
        }}
      >
        <h1
          style={{
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: "2.4rem",
            letterSpacing: "-0.01em",
            marginBottom: "0.25rem",
          }}
        >
          SwarmHaul
        </h1>
        <p
          style={{
            fontSize: "1.1rem",
            color: "var(--ifm-color-emphasis-700)",
            marginBottom: "2.5rem",
          }}
        >
          Multi-agent coordination protocol on Solana. Autonomous agents
          discover tasks, self-organize into delivery swarms, and settle
          payment per-contribution on-chain.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1rem",
          }}
        >
          <Section
            title="Start with MCP"
            href="/reference/mcp"
            description="Copy the public endpoint into Claude Desktop, Cursor, or any HTTP MCP client and your agent can list tasks, bid, and check reputation in seconds."
          />
          <Section
            title="Protocol walkthrough"
            href="/reference/leg-lifecycle"
            description="Every step from shipper list_package through agent bids, swarm formation, multi-leg handoff, and on-chain settle."
          />
          <Section
            title="Reputation economics"
            href="/reference/reputation-economics"
            description="The bounded payout split (α=0.7), formation nudge (γ=0.08), and first-meeting Sybil ceiling. White-paper-level depth."
          />
          <Section
            title="Latest update"
            href="/updates/2026-04-20-multi-leg"
            description="Multi-leg handoff auth + agent execution loop (2026-04-20)."
          />
        </div>

        <hr style={{ margin: "3rem 0", opacity: 0.2 }} />

        <div
          style={{
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: "0.85rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <a href="https://dashboard.swarmhaul.defited.com">
            Live Dashboard ↗
          </a>
          <a href="https://swarmhaul.defited.com">Pitch ↗</a>
          <a href="https://api.swarmhaul.defited.com/mcp/tools">
            Live MCP tools ↗
          </a>
          <a href="https://github.com/mighty840/swarmhaul">GitHub ↗</a>
        </div>
      </main>
    </Layout>
  );
}

function Section({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      to={href}
      style={{
        display: "block",
        padding: "1.25rem",
        border: "1px solid var(--ifm-color-emphasis-300)",
        borderRadius: 4,
        textDecoration: "none",
      }}
    >
      <h3
        style={{
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          fontSize: "0.95rem",
          letterSpacing: "0.02em",
          marginBottom: "0.4rem",
        }}
      >
        {title} ↗
      </h3>
      <p
        style={{
          fontSize: "0.85rem",
          color: "var(--ifm-color-emphasis-700)",
          margin: 0,
        }}
      >
        {description}
      </p>
    </Link>
  );
}
