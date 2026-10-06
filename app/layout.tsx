import type { Metadata, Viewport } from "next";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RegisterServiceWorker } from "@/components/register-sw";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for ratings, scores and page titles: a sturdy grotesk with
// real weight at the top end, so the numbers read like a scoreboard without
// borrowing a novelty font. Body copy stays Geist.
const archivo = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "SECBL",
  description: "Stats, ratings, brackets, and events for the SEC billiards group",
};

// Tints the mobile browser chrome in club felt green. Kept in sync with
// --primary in app/globals.css and theme_color in app/manifest.ts.
export const viewport: Viewport = {
  themeColor: "#03600c",
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
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
