import { describe, expect, it } from "vitest";
import { feedUrlProblem, isIpLiteral, isPrivateIp } from "@/lib/url-guard";

describe("feedUrlProblem", () => {
  it("accepts a public https feed", () => {
    expect(feedUrlProblem("https://pin.gsu.edu/organization/pantherpool/events.ics")).toBeNull();
  });
  it("rejects non-https, credentials, local names and IP literals", () => {
    expect(feedUrlProblem("http://pin.gsu.edu/events.ics")).toMatch(/https/);
    expect(feedUrlProblem("https://user:pw@pin.gsu.edu/x")).toMatch(/username/);
    expect(feedUrlProblem("https://localhost/x")).toMatch(/public website/);
    expect(feedUrlProblem("https://db.internal/x")).toMatch(/public website/);
    expect(feedUrlProblem("https://intranet/x")).toMatch(/public website/);
    expect(feedUrlProblem("https://10.0.0.5/x")).toMatch(/IP address/);
    expect(feedUrlProblem("https://[::1]/x")).toMatch(/IP address/);
    expect(feedUrlProblem("not a url")).toMatch(/valid URL/);
  });
});

describe("isPrivateIp", () => {
  it("flags private, loopback, link-local, CGNAT and mapped ranges", () => {
    for (const ip of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it("passes public addresses", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "131.96.1.1", "2606:4700::1111"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
});

describe("isIpLiteral", () => {
  it("recognises v4 and v6 literals only", () => {
    expect(isIpLiteral("1.2.3.4")).toBe(true);
    expect(isIpLiteral("[2001:db8::1]")).toBe(true);
    expect(isIpLiteral("pin.gsu.edu")).toBe(false);
  });
});
