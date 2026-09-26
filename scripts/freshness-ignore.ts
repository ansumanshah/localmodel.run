export function parseIgnoredSlugs(contents: string): Set<string> {
  return new Set(
    contents.split("\n").map((line) => line.split("#")[0].trim().toLowerCase()).filter(Boolean),
  );
}
