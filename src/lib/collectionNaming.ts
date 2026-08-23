// Suggests the next name in a sequence for "start a fresh collection" — never
// mutates or deletes the original, just proposes "{base} 2", "{base} 3", etc.
// Stripping a trailing " <number>" first means clicking it again on "Foo 2"
// suggests "Foo 3", not "Foo 2 2".
export function nextCollectionName(name: string, existingNames: string[]): string {
  const base = name.replace(/\s+\d+$/, "").trim();
  const taken = new Set(existingNames.map((n) => n.trim()));
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Every collection in the same numbered sequence as `name` — "Aesthetic
// Reels" and "Aesthetic Reels 2" belong to the same family. Sorted so the
// unnumbered base comes first, then 2, 3, ... Used to render them as tabs.
export function collectionFamily<T extends { id: string; name: string }>(name: string, collections: T[]): T[] {
  const base = name.replace(/\s+\d+$/, "").trim();
  const pattern = new RegExp(`^${escapeRegExp(base)}(?: (\\d+))?$`);
  return collections
    .map((c) => ({ item: c, match: c.name.trim().match(pattern) }))
    .filter((x): x is { item: T; match: RegExpMatchArray } => !!x.match)
    .sort((a, b) => (a.match[1] ? Number(a.match[1]) : 1) - (b.match[1] ? Number(b.match[1]) : 1))
    .map((x) => x.item);
}
