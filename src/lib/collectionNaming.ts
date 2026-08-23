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
