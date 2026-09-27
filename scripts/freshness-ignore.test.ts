import { expect, test } from "bun:test";
import { findNewSlugs, parseSlugLines } from "./freshness-ignore";

test("ignores comments beside reviewed model slugs", () => {
  expect([...parseSlugLines("# reviewed\nQwen3.5  # already covered\n\n glm-ocr # specialized\n")])
    .toEqual(["qwen3.5", "glm-ocr"]);
});

test("surfaces only new slugs after the historical backlog", () => {
  expect(findNewSlugs(["tracked", "ignored", "old", "new", "newer"],
    new Set(["tracked"]), new Set(["ignored"]), new Set(["old"]), 1)).toEqual(["new"]);
});
