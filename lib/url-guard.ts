// Guards for admin-supplied feed URLs the server will fetch. Pure checks live
// here (tested); the DNS resolution step is in lib/sync-sources.

const FORBIDDEN_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.lan|metadata\.google\.internal)$/i;

export function isIpLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "");
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || bare.includes(":");
}

// RFC 1918/4193/3927, loopback, unspecified, CGNAT, cloud metadata.
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fc") || v6.startsWith("fd")) return true; // ULA
  if (v6.startsWith("fe80")) return true; // link-local
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7)); // mapped v4
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
