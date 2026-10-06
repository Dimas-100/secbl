import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "SECBL",
  description: "Stats, ratings, brackets, and events for the SEC billiards group",
};

// Near-black app ground; matches --background in app/globals.css and
// theme_color in app/manifest.ts.
export const viewport: Viewport = {
  themeColor: "#0E0F11",
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
      </body>
    </html>
  );
}
