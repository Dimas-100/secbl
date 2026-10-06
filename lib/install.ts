import QRCode from "qrcode";

// The public address the QR codes and the printed card point at. Comes from
// configuration, never from request headers, so a spoofed Host can't put a
// different site on the card. Set NEXT_PUBLIC_SITE_URL when the custom
// domain is connected.
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  return "https://secbl.vercel.app";
}

// A QR code as a data URI for a plain <img>, so no markup is injected.
// "screen" draws light modules for the dark app ground; "print" draws ink
// on paper. Both are the app's own neutrals, never a brand colour, because
// a scanner wants contrast, not personality.
export async function qrDataUri(url: string, size = 220, mode: "screen" | "print" = "screen"): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    width: size,
    color: mode === "print" ? { dark: "#0E0F11", light: "#ffffff00" } : { dark: "#F2F1EE", light: "#ffffff00" },
    errorCorrectionLevel: "M",
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
