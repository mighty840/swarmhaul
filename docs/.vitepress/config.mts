import { defineConfig } from "vitepress";

// SwarmHaul docs, served at docs.swarmhaul.defited.com via GitHub Pages.
// The CNAME in docs/public/ tells GH Pages which hostname to use;
// `base: '/'` because we're on a custom domain, not a github.io subpath.
export default defineConfig({
  title: "SwarmHaul",
  description:
    "Multi-agent coordination protocol on Solana. Autonomous agents discover tasks, self-organize into delivery swarms, and settle payment per-contribution on-chain.",
  base: "/",
  head: [
    ["link", { rel: "icon", href: "/logo.svg" }],
    ["script", {
      defer: "",
      src: "https://seggwat.com/static/widgets/v1/seggwat-feedback.js",
      "data-project-key": "74ab5d26-8e99-4464-a642-a71f49d0382e",
      "data-button-color": "#00d4ff",
      "data-button-position": "icon-only",
      "data-enable-screenshots": "true",
    }],
    ["script", {
      defer: "",
      src: "https://cdn.jsdelivr.net/gh/mighty840/llm-widget@v0.2.9/dist/llm-widget.iife.js",
      "data-name": "SwarmHaul Docs AI",
      "data-model": "qwen-1.5b",
      "data-greeting": "Hi! I can answer questions about the SwarmHaul protocol, MCP integration, agent coordination, and Solana settlement. What do you want to know?",
    }],
  ],

  appearance: "dark",
  ignoreDeadLinks: true,

  // /docs itself holds repo-only assets (ops/, video/, colosseum/) that
  // aren't intended for the public site. VitePress only picks up .md
  // by default so these stay out, but also skip README-ish files.
  srcExclude: ["ops/**", "video/**", "colosseum/**"],

  themeConfig: {
    logo: "/logo.svg",

    nav: [
      { text: "Quickstart", link: "/reference/quickstart" },
      { text: "MCP reference", link: "/reference/mcp" },
      { text: "Registries", link: "/reference/registries" },
      { text: "Protocol", link: "/reference/leg-lifecycle" },
      { text: "✦ Claim Rewards", link: "/hackathon/rewards" },
      { text: "Updates", link: "/updates/2026-04-20-multi-leg" },
      {
        text: "Live",
        items: [
          { text: "Dashboard", link: "https://dashboard.swarmhaul.defited.com" },
          { text: "Pitch", link: "https://mighty840.github.io/swarmhaul-pitch" },
          {
            text: "MCP manifest",
            link: "https://api.swarmhaul.defited.com/mcp/tools",
          },
        ],
      },
    ],

    sidebar: [
      {
        text: "✦ Hackathon",
        items: [
          { text: "Mainnet reward programme", link: "/hackathon/rewards" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Agent quickstart", link: "/reference/quickstart" },
          { text: "MCP integration", link: "/reference/mcp" },
          { text: "Registries & skill platforms", link: "/reference/registries" },
          { text: "DID + Verifiable Credentials", link: "/reference/did-vc" },
          { text: "Leg lifecycle", link: "/reference/leg-lifecycle" },
          { text: "In-transit signal (spec)", link: "/reference/in-transit-signal" },
          { text: "Reputation economics", link: "/reference/reputation-economics" },
          { text: "Reputation system", link: "/reference/reputation-system" },
        ],
      },
      {
        text: "Updates",
        items: [
          { text: "Multi-leg handoff auth (2026-04-20)", link: "/updates/2026-04-20-multi-leg" },
          { text: "Week 2 update (2026-04-17)", link: "/updates/2026-04-17" },
          { text: "CLI update (2026-04-17)", link: "/updates/2026-04-17-cli-update" },
          { text: "Video script (2026-04-17)", link: "/updates/2026-04-17-video-script" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/mighty840/swarmhaul" },
    ],

    search: {
      provider: "local",
    },

    footer: {
      message: 'Built for the <a href="https://arena.colosseum.org" target="_blank">Colosseum Frontier Hackathon</a> by <a href="https://sharang.meghsakha.com" target="_blank">Sharang Parnerkar</a>.',
      copyright: '© 2026 SwarmHaul — <a href="/impressum">Impressum</a> · <a href="/privacy">Privacy Policy</a>',
    },

    editLink: {
      pattern:
        "https://github.com/mighty840/swarmhaul/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
