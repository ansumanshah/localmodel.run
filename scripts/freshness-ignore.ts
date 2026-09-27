export function parseSlugLines(contents: string): Set<string> {
  return new Set(
    contents.split("\n").map((line) => line.split("#")[0].trim().toLowerCase()).filter(Boolean),
  );
}

export function findNewSlugs(
  slugs: readonly string[], tracked: ReadonlySet<string>, ignored: ReadonlySet<string>,
  baseline: ReadonlySet<string>, limit: number,
): string[] {
  return slugs.filter((slug) => !tracked.has(slug) && !ignored.has(slug) && !baseline.has(slug)).slice(0, limit);
}
