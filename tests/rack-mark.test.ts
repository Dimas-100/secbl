import { describe, expect, it } from "vitest";
import { RACK_BALLS, RACK_R, rackSvg } from "@/lib/rack-mark";

const count = (s: string, needle: string) => s.split(needle).length - 1;

describe("RACK_BALLS", () => {
  it("is a rack of six touching balls, four lit: the bottom row and the left middle", () => {
    expect(RACK_BALLS).toHaveLength(6);
    expect(RACK_BALLS.filter((b) => b.lit)).toHaveLength(4);
    expect(RACK_BALLS.filter((b) => b.cy === 68.2).every((b) => b.lit)).toBe(true);
    expect(RACK_BALLS.find((b) => b.cy === 31.8)?.lit).toBe(false);
    // Neighbours in a row touch with a hair between them, never overlap.
    expect(RACK_BALLS[4].cx - RACK_BALLS[3].cx).toBeGreaterThanOrEqual(2 * RACK_R);
  });
  it("stays inside the safe circle of a maskable icon at the scale it is rendered at", () => {
    const reach = Math.max(...RACK_BALLS.map((b) => Math.hypot(b.cx - 50, b.cy - 50) + RACK_R));
    expect(reach * 0.84).toBeLessThan(40);
  });
});

describe("rackSvg", () => {
  it("draws the app tile with its corners, and the balls lit and unlit", () => {
    const svg = rackSvg({ tile: "rounded", size: 64 });
    expect(svg).toContain('width="64" height="64"');
    expect(svg).toContain('rx="22"');
    expect(count(svg, "<circle")).toBe(6);
    expect(count(svg, 'fill="url(#secbl-lit)"')).toBe(4);
    expect(count(svg, 'fill="url(#secbl-unlit)"')).toBe(2);
  });
  it("bleeds to the edge for a cropped icon and scales the rack around its centre", () => {
    const svg = rackSvg({ tile: "square", scale: 0.84 });
    expect(svg).toContain('<rect width="100" height="100" fill="url(#secbl-tile)"/>');
    expect(svg).not.toContain("rx=");
    expect(svg).toContain("translate(50 50) scale(0.84) translate(-50 -50)");
    // No size given: the SVG fills its box.
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">')).toBe(true);
  });
  it("is the bare rack in one colour for the notification badge", () => {
    const svg = rackSvg({ tile: "none", mono: "#FFFFFF" });
    expect(svg).not.toContain("<rect");
    expect(svg).not.toContain("Gradient");
    expect(count(svg, 'fill="#FFFFFF"')).toBe(6);
  });
  it("crops a bare mark to a square around the rack, and only a bare one", () => {
    expect(rackSvg({ tile: "none", fit: true })).toContain('viewBox="19 19 62 62"');
    expect(rackSvg({ tile: "rounded", fit: true })).toContain('viewBox="0 0 100 100"');
    // Every ball sits inside the cropped square.
    for (const b of RACK_BALLS) {
      expect(b.cx - RACK_R).toBeGreaterThanOrEqual(19);
      expect(b.cx + RACK_R).toBeLessThanOrEqual(81);
      expect(b.cy - RACK_R).toBeGreaterThanOrEqual(19);
      expect(b.cy + RACK_R).toBeLessThanOrEqual(81);
    }
  });
});
