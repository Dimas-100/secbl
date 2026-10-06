// Guards for admin-supplied feed URLs the server will fetch. Pure checks live
// here (tested). They are a first filter with friendly messages, not the
// security boundary: the authoritative control is the pinned connector in
// lib/sync-sources, which resolves the host at connect time and refuses any
// private, loopback, link-local or reserved answer — so URL-parser quirks or
// DNS tricks (nip.io-style names, rebinding) cannot reach an internal address.

const FORBIDDEN_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.lan|metadata\.google\.internal)$/i;

export function isIpLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "");
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || bare.includes(":");
}

// RFC 1918/4193/3927, loopback, unspecified, CGNAT, cloud metadata.
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b, c] = [Number(v4[1]), Number(v4[2]), Number(v4[3])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast, reserved, broadcast
    return false;
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fc") || v6.startsWith("fd")) return true; // ULA
  if (v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb")) return true; // link-local
  if (v6.startsWith("ff")) return true; // multicast
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7)); // mapped v4
  // 6to4 (2002:AABB:CCDD::) and Teredo (2001:0::) embed an IPv4 address.
  const sixToFour = v6.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})/);
  if (sixToFour) {
    const hi = parseInt(sixToFour[1], 16);
    const lo = parseInt(sixToFour[2], 16);
    return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (v6.startsWith("2001:0:") || v6.startsWith("2001::")) return true; // Teredo: refuse rather than decode
  return false;
}

// Static checks on the URL itself. Returns a reason, or null when acceptable.
export function feedUrlProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "That feed link is not a valid URL.";
  }
  if (url.protocol !== "https:") return "Feed links must start with https://";
  if (url.username || url.password) return "Feed links can't contain a username or password.";
  const host = url.hostname;
  if (isIpLiteral(host)) return "Use the site's domain name, not an IP address.";
  if (!host.includes(".") || FORBIDDEN_HOST.test(host)) return "That host isn't a public website.";
  return null;
}
