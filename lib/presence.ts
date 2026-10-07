// Presence, pure half: Realtime hands back { key: metas[] }; the channel is
// keyed by member id, so the keys are who is online. A meta's own `id` is
// honoured first in case a key ever isn't one.
export function onlineIds(state: Record<string, { id?: string; [key: string]: unknown }[]>): Set<string> {
  const out = new Set<string>();
  for (const [key, metas] of Object.entries(state)) {
    if (metas.length === 0) continue;
    for (const m of metas) out.add(typeof m.id === "string" && m.id ? m.id : key);
  }
  return out;
}
