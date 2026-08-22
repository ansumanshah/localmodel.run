import { describe, expect, test } from "bun:test";
import { alignEntities, redact, type PipelineToken } from "./pii-align";

const tok = (word: string, entity = "O", score = 0.9): PipelineToken => ({
  entity,
  score,
  index: 0,
  word,
});

describe("alignEntities", () => {
  test("locates spans by walking tokens with a cursor and merges name pieces", () => {
    const text = "Call Priya Sharma at priya@x.com now";
    const entities = alignEntities(text, [
      tok("Call"),
      tok("Priya", "I-GIVENNAME", 0.8),
      tok("Sharma", "I-SURNAME", 1.0),
      tok("at"),
      tok("priya", "I-EMAIL"),
      tok("@", "I-EMAIL"),
      tok("x", "I-EMAIL"),
      tok(".", "I-EMAIL"),
      tok("com", "I-EMAIL"),
      tok("now"),
    ]);
    expect(entities).toHaveLength(2);
    expect(entities[0]).toMatchObject({ tag: "NAME", text: "Priya Sharma", start: 5, end: 17 });
    expect(entities[0].score).toBeCloseTo(0.9);
    expect(entities[1]).toMatchObject({ tag: "EMAIL", text: "priya@x.com" });
    expect(redact(text, entities)).toBe("Call [NAME] at [EMAIL] now");
  });

  test("cursor is monotonic: a repeated word matches its own occurrence, not an earlier one", () => {
    const text = "aa b aa";
    const entities = alignEntities(text, [tok("aa"), tok("b"), tok("aa", "I-USERNAME")]);
    expect(entities).toEqual([
      { start: 5, end: 7, tag: "USERNAME", text: "aa", score: 0.9 },
    ]);
  });

  test("an unlocatable token is skipped without derailing later alignment", () => {
    const text = "id 12345 end";
    const entities = alignEntities(text, [
      tok("id"),
      tok("<unk>", "I-IDCARDNUM"),
      tok("12345", "I-IDCARDNUM"),
      tok("end"),
    ]);
    expect(entities).toEqual([{ start: 3, end: 8, tag: "ID", text: "12345", score: 0.9 }]);
  });

  test("same tag far apart stays two entities; word content is never bridged", () => {
    const text = "Priya lives far from Sharma";
    const entities = alignEntities(text, [
      tok("Priya", "I-GIVENNAME"),
      tok("lives"),
      tok("far"),
      tok("from"),
      tok("Sharma", "I-SURNAME"),
    ]);
    expect(entities).toHaveLength(2);
    expect(redact(text, entities)).toBe("[NAME] lives far from [NAME]");
  });

  test("unmapped labels fall through raw so a model revision fails loudly, not wrongly", () => {
    const text = "x NEWTHING y";
    const entities = alignEntities(text, [tok("x"), tok("NEWTHING", "I-FUTURELABEL"), tok("y")]);
    expect(entities[0].tag).toBe("FUTURELABEL");
  });
});
