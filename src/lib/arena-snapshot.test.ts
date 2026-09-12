import { describe, expect, test } from "bun:test";
import { assertArenaSnapshot, fetchArenaSnapshot, type ArenaRow } from "./arena-snapshot";

const NOW = new Date("2026-09-12T12:00:00.000Z");
const REVISION = "b9c5e261b09333707d0bcc5823b0fd0d8cd1bab2";
const NAMES = ["gpt-6-astra-max", "gemma-4-31b"] as const;

function row(model_name: string, overrides: Partial<ArenaRow> = {}): ArenaRow {
  return {
    model_name,
    organization: "Example Lab",
    license: "proprietary",
    rating: 1234,
    rating_lower: 1200,
    rating_upper: 1260,
    variance: 2.5,
    vote_count: 42,
    rank: 7,
    category: "overall",
    leaderboard_publish_date: "2026-09-10",
    ...overrides,
  };
}

function page(rows: ArenaRow[], total = rows.length, partial = false) {
  return {
    features: [{ name: "model_name", type: "string" }],
    rows: rows.map((value, row_idx) => ({ row_idx, row: value, truncated_cells: [] })),
    num_rows_total: total,
    partial,
  };
}

function fullPage(first: ArenaRow): ArenaRow[] {
  return [first, ...Array.from({ length: 99 }, (_, index) => row(`unselected-${index}`))];
}

function fetchFixture(pages: ReturnType<typeof page>[], revisions: string[] = pages.map(() => REVISION)): typeof fetch {
  return (async (input: URL | RequestInfo) => {
    const offset = Number(new URL(typeof input === "string" ? input : input.url).searchParams.get("offset"));
    const item = pages[offset / 100];
    if (!item) return new Response("missing fixture", { status: 404 });
    return new Response(JSON.stringify(item), { headers: { "x-revision": revisions[offset / 100] } });
  }) as typeof fetch;
}

describe("fetchArenaSnapshot", () => {
  test("paginates, selects canonical names exactly, and pins provenance", async () => {
    const snapshot = await fetchArenaSnapshot(
      NAMES,
      fetchFixture([page(fullPage(row(NAMES[0])), 101), page([row(NAMES[1], { rank: 8 })], 101)]),
      NOW,
    );
    expect(snapshot.rows.map((entry) => entry.model_name)).toEqual(NAMES);
    expect(snapshot.revision).toBe(REVISION);
    expect(snapshot.sourceUrl).toContain(`/blob/${REVISION}/text_style_control/latest-00000-of-00001.parquet`);
    expect(snapshot.sourceApiUrl).toContain("offset=0");
  });

  test("does not request an irrelevant tail after every selected name is found", async () => {
    let calls = 0;
    const firstPage = fullPage(row(NAMES[0]));
    firstPage[1] = row(NAMES[1], { rank: 8 });
    const selectedEarly = (async () => {
      calls++;
      return new Response(JSON.stringify(page(firstPage, 201)), { headers: { "x-revision": REVISION } });
    }) as typeof fetch;
    const snapshot = await fetchArenaSnapshot(NAMES, selectedEarly, NOW);
    expect(calls).toBe(1);
    expect(snapshot.rows.map((entry) => entry.model_name)).toEqual(NAMES);
  });

  test("rejects a response whose revision changes between pages", async () => {
    await expect(
      fetchArenaSnapshot(NAMES, fetchFixture([page(fullPage(row(NAMES[0])), 101), page([row(NAMES[1])], 101)], [REVISION, "a".repeat(40)]), NOW),
    ).rejects.toThrow("different dataset revision");
  });

  test("retries transient 429 and 5xx responses before accepting a complete page", async () => {
    let calls = 0;
    const transientFixture = (async () => {
      calls++;
      if (calls === 1) return new Response("busy", { status: 429 });
      if (calls === 2) return new Response("unavailable", { status: 500 });
      return new Response(JSON.stringify(page([row(NAMES[0]), row(NAMES[1])])), {
        headers: { "x-revision": REVISION },
      });
    }) as typeof fetch;
    const snapshot = await fetchArenaSnapshot(NAMES, transientFixture, NOW);
    expect(calls).toBe(3);
    expect(snapshot.rows).toHaveLength(2);
  });

  test("preserves absent optional metadata while rejecting invalid critical metrics", async () => {
    const accepted = await fetchArenaSnapshot(
      NAMES,
      fetchFixture([page([row(NAMES[0], { organization: "", license: null }), row(NAMES[1], { organization: null, license: "" })])]),
      NOW,
    );
    expect(accepted.rows[0].organization).toBe("");
    expect(accepted.rows[0].license).toBeNull();
    await expect(
      fetchArenaSnapshot(NAMES, fetchFixture([page([row(NAMES[0], { rating: Number.NaN }), row(NAMES[1])])]), NOW),
    ).rejects.toThrow("rating is not finite");
  });

  test("rejects truncated rows, partial pages, and fixture-server failures", async () => {
    const truncated = page([row(NAMES[0]), row(NAMES[1])]);
    truncated.rows[0].truncated_cells = ["rating"];
    await expect(fetchArenaSnapshot(NAMES, fetchFixture([truncated]), NOW)).rejects.toThrow("truncated");
    await expect(fetchArenaSnapshot(NAMES, fetchFixture([page([row(NAMES[0]), row(NAMES[1])], 2, true)]), NOW)).rejects.toThrow("partial");
    await expect(fetchArenaSnapshot(NAMES, fetchFixture([]), NOW)).rejects.toThrow("HTTP 404");
  });

  test("rejects missing exact matches and mixed publication dates", async () => {
    await expect(fetchArenaSnapshot(NAMES, fetchFixture([page([row("gpt-6-astra"), row(NAMES[1])])]), NOW)).rejects.toThrow("absent");
    await expect(
      fetchArenaSnapshot(NAMES, fetchFixture([page([row(NAMES[0]), row(NAMES[1], { leaderboard_publish_date: "2026-09-09" })])]), NOW),
    ).rejects.toThrow("share one publication date");
  });
});

describe("assertArenaSnapshot", () => {
  test("rejects invalid bounds, non-integer counts, and future publication dates", () => {
    const base = {
      schemaVersion: 1,
      source: "Arena",
      sourceUrl: `https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/blob/${REVISION}/text_style_control/latest-00000-of-00001.parquet`,
      sourceApiUrl: "https://datasets-server.huggingface.co/filter?dataset=lmarena-ai%2Fleaderboard-dataset&config=text_style_control&split=latest&where=%22category%22%3D%27overall%27&offset=0&length=100",
      license: "CC-BY-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      subset: "text_style_control",
      category: "overall",
      metric: "Bradley-Terry rating",
      snapshotDate: "2026-09-10",
      revision: REVISION,
      retrievedAt: NOW.toISOString(),
      rows: [row(NAMES[0]), row(NAMES[1])],
    };
    expect(() => assertArenaSnapshot({ ...base, rows: [row(NAMES[0], { rating_lower: 1300 }), row(NAMES[1]) ] }, NAMES, NOW)).toThrow("unordered");
    expect(() => assertArenaSnapshot({ ...base, rows: [row(NAMES[0], { vote_count: 1.5 }), row(NAMES[1]) ] }, NAMES, NOW)).toThrow("positive integer");
    expect(() => assertArenaSnapshot({ ...base, snapshotDate: "2026-09-13", rows: [row(NAMES[0], { leaderboard_publish_date: "2026-09-13" }), row(NAMES[1], { leaderboard_publish_date: "2026-09-13" })] }, NAMES, NOW)).toThrow("dates");
  });
});
