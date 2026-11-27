// The Glossary (spec clean-site, design C9, requirement 11): one plain meaning per Term, the plural forms, and the
// marking of Terms in running text. The meanings are the approved design's. Pure.

export const TERMS = [
  "provenance",
  "advisory",
  "maintainer",
  "deprecated",
  "install script",
  "transitive reach",
  "pull request",
  "last publish",
  "publisher",
] as const;
export type Term = (typeof TERMS)[number];

/** One meaning per Term; a Term without one fails typecheck (11.8). At most 25 words each (11.1). */
export const MEANING: { readonly [K in Term]: string } = {
  provenance: "A signed record that shows where a package was built. If it suddenly goes missing, be suspicious.",
  advisory: "A public warning that a package has a known security hole.",
  maintainer: "A person allowed to publish new versions of a package.",
  deprecated: "The authors have said: stop using this. It gets no more fixes.",
  "install script": "Code that runs on your computer the moment you install the package. Attackers love these.",
  "transitive reach": "How many other packages in your app pull this one in.",
  "pull request": "A suggested change to your code. Nothing changes until a person approves it.",
  "last publish": "When the newest version came out. Very old can mean abandoned.",
  publisher: "The account or system that uploaded this version.",
};

/** The plural forms, each mapped to its Term (11.6). Case is ignored when marking. */
export const FORMS: Readonly<Record<string, Term>> = {
  advisories: "advisory",
  maintainers: "maintainer",
  "install scripts": "install script",
  "pull requests": "pull request",
  publishers: "publisher",
};

export type TermPart = { readonly text: string } | { readonly text: string; readonly term: Term };

const ALL_FORMS: ReadonlyMap<string, Term> = new Map<string, Term>([...TERMS.map((t) => [t, t] as const), ...Object.entries(FORMS)]);
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Longest form first, whole words only, any case. */
const PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}_])(${[...ALL_FORMS.keys()].sort((a, b) => b.length - a.length).map(escape).join("|")})(?![\\p{L}\\p{N}_])`,
  "giu",
);

/** Pure. The text split into plain parts and Term parts; joining the parts' text gives the input back (11.7). */
export function markTerms(text: string): readonly TermPart[] {
  const parts: TermPart[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const start = m.index;
    const found = m[0];
    const term = ALL_FORMS.get(found.toLowerCase());
    if (term === undefined) continue;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: found, term });
    last = start + found.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
