import assert from "node:assert/strict";
import test from "node:test";
import { completeGgufBytes } from "./update-data.mjs";

const q4 = /(?:^|[-_.])Q4_K_M(?=$|[-_.])/i;

test("uses one complete GGUF artifact and rejects alternate or incomplete copies", () => {
  assert.equal(
    completeGgufBytes(
      [
        { name: "model-Q4_K_M-00001-of-00002.gguf", size: 2 },
        { name: "model-Q4_K_M-00002-of-00002.gguf", size: 3 },
        { name: "MTP/model-MTP-Q4_K_M.gguf", size: 1 },
      ],
      q4,
    ),
    5,
  );
  assert.equal(
    completeGgufBytes(
      [
        { name: "model-Q4_K_M.gguf", size: 5 },
        { name: "model-UD-Q4_K_M.gguf", size: 6 },
      ],
      q4,
    ),
    null,
  );
  assert.equal(
    completeGgufBytes([{ name: "model-Q4_K_M-00001-of-00002.gguf", size: 2 }], q4), null);
  assert.equal(
    completeGgufBytes(
      [
        { name: "mmproj-f16.gguf", size: 2 },
        { name: "mmproj-f16-copy.gguf", size: 2 },
      ],
      /mmproj.*f16/i,
      { excludeAuxiliary: false },
    ),
    null,
  );
});
