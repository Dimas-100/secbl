import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RegisterServiceWorker } from "@/components/register-sw";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SECBL",
  description: "Stats, ratings, brackets, and events for the SEC billiards group",
  // Installed on an iPhone, run full-screen under the status bar.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "SECBL" },
};

// Near-black app ground; matches --background in app/globals.css and
// theme_color in app/manifest.ts.
export const viewport: Viewport = {
  themeColor: "#0E0F11",
  // App framing (spec 2026-10-06-live-club §3): no pinch or double-tap zoom,
  // by the owner's explicit choice — the screens are sized for a phone.
  maximumScale: 1,
  userScalable: false,
  // Lets the fixed tab bar extend under the iPhone home indicator; its
  // bottom padding uses env(safe-area-inset-bottom), which only reports
  // non-zero when the viewport covers the inset.
  viewportFit: "cover",
  // Android Chrome: shrink the layout viewport for the keyboard so the chat
  // composer stays visible above it (iOS is handled via visualViewport).
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterServiceWorker />
        <Analytics />
      </body>
    </html>
  );
}
