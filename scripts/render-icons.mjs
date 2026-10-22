// Draws every SECBL icon from the one mark in lib/rack-mark.ts: the favicon
// SVG, the home-screen PNGs (Android, maskable, iPhone) and the monochrome
// notification badge. Rerun after changing the mark, and commit the output.
//
//   node scripts/render-icons.mjs
//
// Renders with the Playwright Chromium the e2e tests already use; Node loads
// the TypeScript mark directly (type stripping, Node 22.18+).
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { rackSvg } from "../lib/rack-mark.ts";
const require = createRequire(path.join(process.cwd(), "/"));
const { chromium } = require("@playwright/test");

// The app tile with its corners for the favicon and the "any" icons; full
// bleed where the phone crops to its own shape: Android's maskable icon keeps
// the rack inside the safe circle, and iOS rounds the iPhone icon itself.
const PNGS = [
  { file: "public/icon-192.png", size: 192, svg: rackSvg({ tile: "rounded" }) },
  { file: "public/icon-512.png", size: 512, svg: rackSvg({ tile: "rounded" }) },
  { file: "public/icon-maskable-512.png", size: 512, svg: rackSvg({ tile: "square", scale: 0.84 }) },
  { file: "app/apple-icon.png", size: 180, svg: rackSvg({ tile: "square" }) },
  // Android draws a notification badge from its alpha alone: a white rack.
  { file: "public/badge-96.png", size: 96, svg: rackSvg({ tile: "none", mono: "#FFFFFF", fit: true }) },
];

writeFileSync("app/icon.svg", rackSvg({ tile: "rounded" }) + "\n");
console.log("wrote app/icon.svg");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const { file, size, svg } of PNGS) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${svg}</div></body></html>`
    );
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log(`wrote ${file}`);
  }
} finally {
  await browser.close();
}
