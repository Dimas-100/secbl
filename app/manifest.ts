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
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      // "maskable" lets Android crop to its own shape without clipping the rack.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
