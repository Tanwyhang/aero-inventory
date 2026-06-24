import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aero Workspace Selector",
    short_name: "Aero",
    description: "Open the Aero workspace selector.",
    start_url: "/workspaces",
    scope: "/",
    display: "standalone",
    background_color: "#f4f4f5",
    theme_color: "#18181b",
    icons: [
      {
        src: "/aero-shortcut.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
