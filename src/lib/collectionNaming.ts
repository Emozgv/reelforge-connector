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

export function collectionBaseName(name: string): string {
  return name.replace(/\s+\d+$/, "").trim();
}

// "Quick Saves" is a system singleton per Creator (the Hub's catch-all
// save-without-picking-a-collection target, created automatically) — it
// never gets the version/clone treatment, always just the one.
export function isVersionableCollection(name: string): boolean {
  return collectionBaseName(name) !== "Quick Saves";
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

// Groups a flat list into families ("Aesthetic Reels", "Aesthetic Reels 2", ...
// all become one group), each sorted oldest -> newest version. Used to collapse
// a Collections list from "many independent rows" into "one folder per family,
// versions nested underneath" — a single numbered sequence is one folder, not
// several unrelated Collections that happen to share a name.
export function groupCollectionsByFamily<T extends { id: string; name: string }>(items: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const base = collectionBaseName(item.name);
    const list = groups.get(base) ?? [];
    list.push(item);
    groups.set(base, list);
  }
  return [...groups.values()].map((list) => collectionFamily(list[0].name, list));
}
