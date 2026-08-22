import type { PiiEntity } from "../types";

// Pure token-to-offset alignment for the PII runner, in its own module (no
// transformers.js import) so the unit tests can load it without pulling the
// ONNX runtime into the test process.

// Piiranha's per-type labels (I-GIVENNAME, I-TELEPHONENUM, ...) -> the short
// plain-words tag the redacted text shows. Anything unmapped falls through
// to the raw label so a future model revision degrades loudly, not wrongly.
const TAG_WORDS: Record<string, string> = {
  GIVENNAME: "NAME",
  SURNAME: "NAME",
  USERNAME: "USERNAME",
  EMAIL: "EMAIL",
  TELEPHONENUM: "PHONE",
  STREET: "STREET",
  BUILDINGNUM: "STREET",
  CITY: "CITY",
  ZIPCODE: "ZIP",
  DATEOFBIRTH: "DOB",
  CREDITCARDNUMBER: "CARD",
  ACCOUNTNUM: "ACCOUNT",
  SOCIALNUM: "SSN",
  TAXNUM: "TAX-ID",
  IDCARDNUM: "ID",
  DRIVERLICENSENUM: "LICENSE",
  PASSWORD: "PASSWORD",
};

export interface PipelineToken {
  entity: string;
  score: number;
  index: number;
  word: string;
}

// Span merge: same-tag neighbors joined when only short filler sits between
// them ("Priya" + "Sharma" -> one NAME; the dots and @ inside an email).
const BRIDGE_RE = /^[\s.,;:@\-/()'"]*$/;
const BRIDGE_MAX = 3;

/**
 * Align the pipeline's token stream back onto the source string. transformers.js
 * token-classification reports each token's decoded text but not char offsets,
 * so we walk the tokens in order with a cursor and locate each piece with
 * indexOf. Tokenization is order-preserving and (near-)lossless, so each piece
 * matches at the next non-whitespace position; a piece that cannot be located
 * (e.g. an <unk> normalization) is skipped and alignment resumes on the next.
 */
export function alignEntities(text: string, tokens: PipelineToken[]): PiiEntity[] {
  const raw: { start: number; end: number; tag: string; score: number }[] = [];
  let cursor = 0;
  for (const t of tokens) {
    const piece = t.word.trim();
    if (!piece) continue;
    const at = text.indexOf(piece, cursor);
    if (at === -1) continue;
    cursor = at + piece.length;
    if (t.entity === "O") continue;
    const label = t.entity.replace(/^[BI]-/, "");
    raw.push({ start: at, end: cursor, tag: TAG_WORDS[label] ?? label, score: t.score });
  }

  const merged: (PiiEntity & { n: number })[] = [];
  for (const r of raw) {
    const prev = merged[merged.length - 1];
    const gap = prev ? text.slice(prev.end, r.start) : "";
    if (
      prev &&
      prev.tag === r.tag &&
      r.start >= prev.end &&
      gap.length <= BRIDGE_MAX &&
      BRIDGE_RE.test(gap)
    ) {
      prev.end = Math.max(prev.end, r.end);
      prev.score += r.score;
      prev.n += 1;
      prev.text = text.slice(prev.start, prev.end);
    } else {
      merged.push({
        start: r.start,
        end: r.end,
        tag: r.tag,
        text: text.slice(r.start, r.end),
        score: r.score,
        n: 1,
      });
    }
  }
  return merged.map(({ n, ...e }) => ({ ...e, score: e.score / n }));
}

/** The input with every detected span replaced by its [TAG]. */
export function redact(text: string, entities: PiiEntity[]): string {
  let out = "";
  let cursor = 0;
  for (const e of entities) {
    out += text.slice(cursor, e.start) + `[${e.tag}]`;
    cursor = e.end;
  }
  return out + text.slice(cursor);
}
