import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

// SwarmHaul docs site — hosted on GitHub Pages under a
// docs.swarmhaul.defited.com CNAME. The docs content lives at
// ../docs (reference + updates). This site is the rendered view.
const config: Config = {
  title: "SwarmHaul",
  tagline: "Multi-agent coordination protocol on Solana",
  favicon: "img/favicon.svg",
  url: "https://docs.swarmhaul.defited.com",
  baseUrl: "/",
  organizationName: "mighty840",
  projectName: "swarmhaul",
  deploymentBranch: "gh-pages",
  trailingSlash: false,
  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",
  i18n: { defaultLocale: "en", locales: ["en"] },
  presets: [
    [
      "classic",
      {
        docs: {
          path: "../docs",
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl:
            "https://github.com/mighty840/swarmhaul/edit/main/docs/",
          // Skip non-markdown assets checked into docs/ (e.g. logos,
          // video scripts, ops TOML).
          exclude: ["ops/**", "**/*.svg", "video/**"],
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    colorMode: { defaultMode: "dark", respectPrefersColorScheme: true },
    navbar: {
      title: "SWARMHAUL",
      logo: { alt: "SwarmHaul", src: "img/logo.svg" },
      items: [
        { to: "/reference/mcp", label: "MCP", position: "left" },
        { to: "/reference/leg-lifecycle", label: "Protocol", position: "left" },
        { to: "/reference/reputation-economics", label: "Reputation", position: "left" },
        { to: "/updates/2026-04-20-multi-leg", label: "Updates", position: "left" },
        {
          href: "https://dashboard.swarmhaul.defited.com",
          label: "Dashboard",
          position: "right",
        },
        {
          href: "https://swarmhaul.defited.com",
          label: "Pitch",
          position: "right",
        },
        {
          href: "https://github.com/mighty840/swarmhaul",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Live",
          items: [
            { label: "Dashboard", href: "https://dashboard.swarmhaul.defited.com" },
            { label: "Pitch", href: "https://swarmhaul.defited.com" },
            { label: "API", href: "https://api.swarmhaul.defited.com/health" },
            { label: "MCP", href: "https://api.swarmhaul.defited.com/mcp" },
          ],
        },
        {
          title: "Code",
          items: [
            { label: "Repo", href: "https://github.com/mighty840/swarmhaul" },
            { label: "Issues", href: "https://github.com/mighty840/swarmhaul/issues" },
          ],
        },
      ],
      copyright: `SwarmHaul — Built for the SWARM hackathon by Colosseum Frontier.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["rust", "toml", "bash", "json"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
