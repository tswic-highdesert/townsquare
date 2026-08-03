/**
 * Deterministic, source-anchored item id. The ONLY sanctioned way to mint a
 * tsp_id in @townsquare/feed. Callers pass the source prefix and a STABLE natural key
 * (upstream numeric id, canonical URL, or iCal UID) — never a title, date,
 * array index, or wall-clock value. This guarantees the same upstream item maps
 * to the same id across runs, so the worker's stale-not-delete model never
 * orphans an RSVP.
 */
export function stableId(source: string, naturalKey: string): string {
  const slug = naturalKey
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  // Short keys: keep the readable slug. Long keys: append a stable hash so two
  // long keys can't collide via truncation (and the id stays bounded).
  if (slug.length <= 48) return `${source}-${slug}`;
  return `${source}-${slug.slice(0, 40)}-${fnv1a(naturalKey)}`;
}

/** Tiny deterministic 32-bit hash (FNV-1a) rendered as base36. No crypto dep needed. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
