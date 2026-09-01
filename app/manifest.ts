import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DamnTodo",
    short_name: "DamnTodo",
    description: "A private, offline planner with backlog, due highlights, reminders, and automatic scheduling.",
    start_url: "/",
    display: "standalone",
    background_color: "#153f69",
    theme_color: "#153f69",
    orientation: "any",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
