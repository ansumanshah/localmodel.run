import { expect, test } from "bun:test";
import { parseIgnoredSlugs } from "./freshness-ignore";

test("ignores comments beside reviewed model slugs", () => {
  expect([...parseIgnoredSlugs("# reviewed\nQwen3.5  # already covered\n\n glm-ocr # specialized\n")])
    .toEqual(["qwen3.5", "glm-ocr"]);
});
