/**
 * Strict importer for the versioned LMArena dataset snapshot used by the cloud
 * comparison. This deliberately consumes the dataset-server API rather than a
 * rendered leaderboard, so every imported value has a pinned dataset revision.
 */

export const ARENA_DATASET = "lmarena-ai/leaderboard-dataset";
export const ARENA_SUBSET = "text_style_control";
export const ARENA_CATEGORY = "overall";
export const ARENA_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
export const ARENA_SOURCE_URL = `https://huggingface.co/datasets/${ARENA_DATASET}`;
export const ARENA_FILTER_ENDPOINT = "https://datasets-server.huggingface.co/filter";

const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 90_000;
const TRANSIENT_RETRIES = 2;
const RETRY_DELAY_MS = 100;

export interface ArenaRow {
  model_name: string;
  // LMArena leaves these descriptive fields unknown for some otherwise valid rows.
  // Preserve its exact null/blank value instead of inventing a replacement.
  organization: string | null;
  license: string | null;
  rating: number;
  rating_lower: number;
  rating_upper: number;
  variance: number;
  vote_count: number;
  rank: number;
  category: "overall";
  leaderboard_publish_date: string;
}

export interface ArenaSnapshot {
  schemaVersion: 1;
  source: "Arena";
  sourceUrl: string;
  sourceApiUrl: string;
  license: "CC-BY-4.0";
  licenseUrl: string;
  subset: "text_style_control";
  category: "overall";
  metric: "Bradley-Terry rating";
  snapshotDate: string;
  revision: string;
  retrievedAt: string;
  rows: ArenaRow[];
}

interface DatasetApiRow {
  row_idx: number;
  row: unknown;
  truncated_cells: unknown[];
}

interface DatasetApiPage {
  features: unknown;
  rows: DatasetApiRow[];
  num_rows_total: number;
  partial: boolean;
}

function problem(message: string): never {
  throw new Error(`Arena snapshot validation failed: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Only accepts a real ISO calendar date, optionally followed by a time zone-aware time. */
function isPastIsoDate(value: unknown, now: Date): value is string {
  if (!isNonEmptyString(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1, 4).map(Number);
  const dateOnly = new Date(Date.UTC(year, month - 1, day));
  if (
    dateOnly.getUTCFullYear() !== year ||
    dateOnly.getUTCMonth() !== month - 1 ||
    dateOnly.getUTCDate() !== day
  ) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.getTime() <= now.getTime();
}

function filterUrl(offset: number): string {
  const url = new URL(ARENA_FILTER_ENDPOINT);
  url.searchParams.set("dataset", ARENA_DATASET);
  url.searchParams.set("config", ARENA_SUBSET);
  url.searchParams.set("split", "latest");
  url.searchParams.set("where", '"category"=\'overall\'');
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("length", String(PAGE_SIZE));
  return url.toString();
}

function sourceUrl(revision: string): string {
  return `${ARENA_SOURCE_URL}/blob/${revision}/${ARENA_SUBSET}/latest-00000-of-00001.parquet`;
}

function parseArenaRow(value: unknown, now: Date, position: string): ArenaRow {
  if (!isRecord(value)) problem(`${position} is not an object`);
  const row = value as Record<string, unknown>;
  if (!isNonEmptyString(row.model_name)) problem(`${position}.model_name is empty`);
  for (const field of ["organization", "license"] as const)
    if (row[field] !== null && typeof row[field] !== "string") problem(`${position}.${field} is not string or null`);
  const numericFields = ["rating", "rating_lower", "rating_upper", "variance"] as const;
  for (const field of numericFields) if (!isFiniteNumber(row[field])) problem(`${position}.${field} is not finite`);
  for (const field of ["vote_count", "rank"] as const)
    if (!isPositiveInteger(row[field])) problem(`${position}.${field} is not a positive integer`);
  if (row.category !== ARENA_CATEGORY) problem(`${position}.category is not overall`);
  if (!isPastIsoDate(row.leaderboard_publish_date, now))
    problem(`${position}.leaderboard_publish_date is not a valid past ISO date`);
  if ((row.rating_lower as number) > (row.rating as number) || (row.rating as number) > (row.rating_upper as number))
    problem(`${position} has unordered rating bounds`);
  return row as unknown as ArenaRow;
}

function assertExpectedNames(expectedNames: readonly string[]): void {
  if (expectedNames.length === 0) problem("no expected Arena model names were supplied");
  if (expectedNames.some((name) => !isNonEmptyString(name))) problem("expected Arena model names include an empty value");
  if (new Set(expectedNames).size !== expectedNames.length) problem("expected Arena model names contain duplicates");
}

function parsePage(value: unknown, now: Date, page: number): DatasetApiPage {
  if (!isRecord(value)) problem(`page ${page} response is not an object`);
  if (!Array.isArray(value.rows)) problem(`page ${page} is missing rows`);
  if (!isPositiveInteger(value.num_rows_total)) problem(`page ${page} has invalid num_rows_total`);
  if (value.partial !== false) problem(`page ${page} is partial`);
  if (!("features" in value)) problem(`page ${page} is missing features`);
  for (const [index, apiRow] of value.rows.entries()) {
    if (!isRecord(apiRow) || !isNonNegativeInteger(apiRow.row_idx))
      problem(`page ${page} row ${index} has invalid row_idx`);
    const truncatedCells = apiRow.truncated_cells;
    if (!Array.isArray(truncatedCells))
      problem(`page ${page} row ${index} is missing truncated_cells`);
    if (truncatedCells.length !== 0)
      problem(`page ${page} row ${index} has truncated cells`);
    parseArenaRow(apiRow.row, now, `page ${page} row ${index}`);
  }
  return value as unknown as DatasetApiPage;
}

async function responsePage(
  fetcher: typeof fetch,
  offset: number,
  now: Date,
): Promise<{ page: DatasetApiPage; revision: string }> {
  let lastFailure = "unknown request failure";
  for (let attempt = 0; attempt <= TRANSIENT_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetcher(filterUrl(offset), {
        headers: { accept: "application/json", "user-agent": "localmodel.run-arena-import/1.0" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
      if (attempt === TRANSIENT_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
      continue;
    }
    if (!response.ok) {
      lastFailure = `HTTP ${response.status}`;
      if (response.status !== 429 && response.status < 500) throw new Error(`Arena snapshot request failed at offset ${offset}: ${lastFailure}`);
      if (attempt === TRANSIENT_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
      continue;
    }
    const revision = response.headers.get("x-revision");
    if (!revision || !/^[0-9a-f]{40}$/i.test(revision)) problem(`page at offset ${offset} has no dataset commit revision`);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      problem(`page at offset ${offset} is not JSON`);
    }
    return { page: parsePage(body, now, offset / PAGE_SIZE + 1), revision };
  }
  throw new Error(`Arena snapshot request failed at offset ${offset}: ${lastFailure} after ${TRANSIENT_RETRIES + 1} attempts`);
}

/**
 * Download filtered rows until all manifest entries are found. Every page we
 * consume is complete and strictly validated, but we do not fetch an unrelated
 * tail after the selected subset is complete. If a name is absent, we scan to
 * the final page before failing. There is intentionally no alias or fuzzy
 * matching: a renamed Arena row must be reviewed explicitly.
 */
export async function fetchArenaSnapshot(
  expectedNames: readonly string[],
  fetcher: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<ArenaSnapshot> {
  assertExpectedNames(expectedNames);
  const first = await responsePage(fetcher, 0, now);
  const total = first.page.num_rows_total;
  const pages = Math.ceil(total / PAGE_SIZE);
  const revision = first.revision;
  const expectedSet = new Set(expectedNames);
  const selectedByName = new Map<string, ArenaRow>();

  const consumePage = (entries: DatasetApiRow[], page: number): void => {
    const expectedRows = Math.min(PAGE_SIZE, total - page * PAGE_SIZE);
    if (entries.length !== expectedRows) problem(`page ${page + 1} is missing rows`);
    for (const [index, entry] of entries.entries()) {
      const row = parseArenaRow(entry.row, now, `page ${page + 1} row ${index}`);
      if (!expectedSet.has(row.model_name)) continue;
      if (selectedByName.has(row.model_name)) problem(`duplicate selected model name ${row.model_name}`);
      selectedByName.set(row.model_name, row);
    }
  };

  consumePage(first.page.rows, 0);

  for (let page = 1; page < pages && selectedByName.size < expectedNames.length; page++) {
    const next = await responsePage(fetcher, page * PAGE_SIZE, now);
    if (next.page.num_rows_total !== total) problem(`page ${page + 1} has a different total`);
    if (next.revision !== revision) problem(`page ${page + 1} has a different dataset revision`);
    consumePage(next.page.rows, page);
  }
  const rows = expectedNames.map((name) => {
    const row = selectedByName.get(name);
    if (!row) problem(`expected Arena model name is absent: ${name}`);
    return row;
  });
  const snapshotDate = rows[0]?.leaderboard_publish_date;
  if (!snapshotDate || rows.some((row) => row.leaderboard_publish_date !== snapshotDate))
    problem("selected rows do not share one publication date");
  const snapshot: ArenaSnapshot = {
    schemaVersion: 1,
    source: "Arena",
    sourceUrl: sourceUrl(revision),
    sourceApiUrl: filterUrl(0),
    license: "CC-BY-4.0",
    licenseUrl: ARENA_LICENSE_URL,
    subset: ARENA_SUBSET,
    category: ARENA_CATEGORY,
    metric: "Bradley-Terry rating",
    snapshotDate,
    revision,
    retrievedAt: now.toISOString(),
    rows,
  };
  assertArenaSnapshot(snapshot, expectedNames, now);
  return snapshot;
}

/** Validate a saved snapshot before a page consumes it. */
export function assertArenaSnapshot(
  value: unknown,
  expectedNames: readonly string[],
  now: Date = new Date(),
): asserts value is ArenaSnapshot {
  assertExpectedNames(expectedNames);
  if (!isRecord(value)) problem("snapshot is not an object");
  const snapshot = value as Record<string, unknown>;
  if (snapshot.schemaVersion !== 1 || snapshot.source !== "Arena") problem("snapshot has an unsupported schema");
  if (snapshot.license !== "CC-BY-4.0" || snapshot.licenseUrl !== ARENA_LICENSE_URL) problem("snapshot has invalid license provenance");
  if (snapshot.subset !== ARENA_SUBSET || snapshot.category !== ARENA_CATEGORY || snapshot.metric !== "Bradley-Terry rating")
    problem("snapshot has invalid Arena scope");
  if (!isNonEmptyString(snapshot.revision) || !/^[0-9a-f]{40}$/i.test(snapshot.revision)) problem("snapshot revision is invalid");
  if (snapshot.sourceUrl !== sourceUrl(snapshot.revision)) problem("snapshot sourceUrl is not pinned to its revision");
  if (snapshot.sourceApiUrl !== filterUrl(0)) problem("snapshot sourceApiUrl is invalid");
  if (!isPastIsoDate(snapshot.snapshotDate, now) || !isPastIsoDate(snapshot.retrievedAt, now))
    problem("snapshot dates are invalid or in the future");
  if (!Array.isArray(snapshot.rows) || snapshot.rows.length !== expectedNames.length) problem("snapshot has the wrong selected row count");
  const actualNames = snapshot.rows.map((row, index) => parseArenaRow(row, now, `snapshot row ${index}`).model_name);
  if (new Set(actualNames).size !== actualNames.length) problem("snapshot has duplicate model names");
  if (actualNames.some((name, index) => name !== expectedNames[index])) problem("snapshot rows do not match the expected canonical names");
  const date = snapshot.snapshotDate;
  if (snapshot.rows.some((row) => row.leaderboard_publish_date !== date)) problem("snapshot rows have mixed publication dates");
}
