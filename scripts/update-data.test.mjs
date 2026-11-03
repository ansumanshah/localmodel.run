import assert from "node:assert/strict";
import test from "node:test";
import { completeGgufBytes, fetchWithRetry, hfQuantSizes } from "./update-data.mjs";

const q4 = /(?:^|[-_.])Q4_K_M(?=$|[-_.])/i;

test("retries only transient refresh failures, with bounded attempts", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const url = "https://example.test/model";

  for (const status of [503, 429]) {
    await t.test(`recovers from HTTP ${status} and cancels the failed body`, async () => {
      const failed = new Response("unavailable", { status });
      const requests = [];
      const headers = { Authorization: "Bearer fixture", Accept: "application/json" };
      globalThis.fetch = async (input, options) => {
        requests.push({ input, options });
        return requests.length === 1 ? failed : new Response("{}");
      };
      assert.equal((await fetchWithRetry(url, { headers })).status, 200);
      assert.equal(requests.length, 2);
      assert.equal(failed.bodyUsed, true);
      assert.equal(requests[0].input, url);
      assert.equal(requests[0].options.headers, headers);
      assert.ok(requests[0].options.signal instanceof AbortSignal);
      assert.notEqual(requests[0].options.signal, requests[1].options.signal);
    });
  }

  await t.test("does not retry HTTP 404", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(null, { status: 404 }); };
    assert.equal((await fetchWithRetry(url)).status, 404);
    assert.equal(calls, 1);
  });

  await t.test("returns the terminal HTTP failure after three attempts", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("unavailable", { status: 503 }); };
    const response = await fetchWithRetry(url);
    assert.equal(response.status, 503);
    assert.equal(await response.text(), "unavailable");
    assert.equal(calls, 3);
  });

  for (const error of [new TypeError("network failure"), new DOMException("timed out", "TimeoutError")]) {
    await t.test(`recovers from ${error.name}`, async () => {
      let calls = 0;
      globalThis.fetch = async () => {
        if (++calls === 1) throw error;
        return new Response("{}");
      };
      assert.equal((await fetchWithRetry(url)).status, 200);
      assert.equal(calls, 2);
    });
  }

  await t.test("throws the terminal network error after three attempts", async () => {
    let calls = 0;
    const error = new TypeError("network failure");
    globalThis.fetch = async () => { calls++; throw error; };
    await assert.rejects(fetchWithRetry(url), (actual) => actual === error);
    assert.equal(calls, 3);
  });

  await t.test("does not retry malformed source JSON", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response("not JSON"); };
    await assert.rejects(hfQuantSizes("fixture/model"), SyntaxError);
    assert.equal(calls, 1);
  });
});

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
