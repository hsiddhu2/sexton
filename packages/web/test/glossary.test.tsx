// Spec clean-site, design C9 and Property 6: marking Terms keeps the text and finds every Term (11.1, 11.6, 11.7).
import { cleanup, fireEvent, render } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FORMS, markTerms, MEANING, TERMS, type Term } from "../src/glossary/glossary.js";
import { TermText } from "../src/glossary/TermText.js";

afterEach(cleanup);

const FORM_LIST: readonly (readonly [string, Term])[] = [...TERMS.map((t) => [t, t] as const), ...Object.entries(FORMS)];
const arbCase = (s: string) =>
  fc.array(fc.boolean(), { minLength: s.length, maxLength: s.length }).map((ups) => [...s].map((c, i) => (ups[i] === true ? c.toUpperCase() : c)).join(""));
/** A plain word: never a form, nor a word of a two-word form, so two plain words never join into a Term. */
const FORM_WORDS = new Set(FORM_LIST.flatMap(([f]) => f.split(" ")));
const arbWord = fc.stringMatching(/^[a-z]{1,9}$/).filter((w) => !FORM_WORDS.has(w));
const arbPiece = fc.oneof(
  arbWord.map((text) => ({ text, term: null as Term | null })),
  fc.constantFrom(...FORM_LIST).chain(([form, term]) => arbCase(form).map((text) => ({ text, term: term as Term | null }))),
);
const arbSep = fc.constantFrom(" ", ", ", ". ", " (", ") ", "\n", ": ");

describe("Feature: clean-site, Property 6: Marking Terms keeps the text and finds every Term", () => {
  it("joins back to the text and returns every Term form as a marked part mapped to its Term", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(arbPiece, arbSep), { maxLength: 20 }), (pieces) => {
        const text = pieces.map(([p, sep]) => p.text + sep).join("");
        const parts = markTerms(text);
        expect(parts.map((p) => p.text).join("")).toBe(text);
        const marked = parts.filter((p): p is { text: string; term: Term } => "term" in p);
        expect(marked.map((p) => p.term)).toEqual(pieces.flatMap(([p]) => (p.term === null ? [] : [p.term])));
      }),
      { numRuns: 100 },
    );
  });

  it("keeps any text unchanged", () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ maxLength: 120 }), (text) => {
        expect(markTerms(text).map((p) => p.text).join("")).toBe(text);
      }),
      { numRuns: 100 },
    );
  });

  it("gives every Term a meaning of 1 to 25 words", () => {
    for (const term of TERMS) {
      const words = MEANING[term].split(/\s+/).filter((w) => w !== "");
      expect(words.length, term).toBeGreaterThanOrEqual(1);
      expect(words.length, term).toBeLessThanOrEqual(25);
    }
    for (const term of Object.values(FORMS)) expect(TERMS).toContain(term);
  });
});

describe("glossary examples", () => {
  it("marks the longest form and whole words only", () => {
    expect(markTerms("Maintainers changed; maintainership did not. Install scripts ran.")).toEqual([
      { text: "Maintainers", term: "maintainer" },
      { text: " changed; maintainership did not. " },
      { text: "Install scripts", term: "install script" },
      { text: " ran." },
    ]);
    expect(markTerms("")).toEqual([]);
  });

  it("renders Terms as buttons with the visible text unchanged, and reports the pressed Term", () => {
    const onTerm = vi.fn();
    const { container } = render(
      <p>
        <TermText text="It lost its provenance and gained a publisher." onTerm={onTerm} />
      </p>,
    );
    expect(container.textContent).toBe("It lost its provenance and gained a publisher.");
    const buttons = [...container.querySelectorAll("button.term")];
    expect(buttons.map((b) => b.textContent)).toEqual(["provenance", "publisher"]);
    expect(buttons.every((b) => b.getAttribute("type") === "button")).toBe(true);
    fireEvent.click(buttons[0] as Element);
    expect(onTerm).toHaveBeenCalledWith("provenance", buttons[0]);
  });
});
