import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SECBL — SEC Billiards League",
    short_name: "SECBL",
    description: "Stats, ratings, brackets, and events for the SEC billiards group",
    start_url: "/",
    display: "standalone",
    // App ground; matches --background in app/globals.css.
    background_color: "#0E0F11",
    theme_color: "#0E0F11",
    // All drawn from lib/rack-mark.ts by scripts/render-icons.mjs.
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Full bleed with the rack inside the safe circle, so Android can crop
      // it to its own shape without clipping a ball.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
