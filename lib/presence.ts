// Presence, pure half: Realtime hands back { key: metas[] } and the channel
// is keyed by member id, so the keys with anyone present are who is online.
// The metas' contents are client-supplied and ignored.
export function onlineIds(state: Record<string, unknown[]>): Set<string> {
  const out = new Set<string>();
  for (const [key, metas] of Object.entries(state)) {
    if (metas.length > 0) out.add(key);
  }
  return out;
}
