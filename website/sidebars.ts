import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: "category",
      label: "Reference",
      collapsed: false,
      items: [
        "reference/mcp",
        "reference/leg-lifecycle",
        "reference/in-transit-signal",
        "reference/reputation-economics",
        "reference/reputation-system",
      ],
    },
    {
      type: "category",
      label: "Updates",
      collapsed: true,
      items: [
        "updates/2026-04-20-multi-leg",
        "updates/2026-04-17",
        "updates/2026-04-17-cli-update",
        "updates/2026-04-17-video-script",
      ],
    },
  ],
};

export default sidebars;
