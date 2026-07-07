import { ui, defaultLang, type Lang, type UIKey } from "./ui";

/** Detect the active locale from a URL path (/es/... -> es, else en). */
export function getLangFromUrl(url: URL): Lang {
  const seg = url.pathname.split("/")[1];
  return seg in ui ? (seg as Lang) : defaultLang;
}

/** Translator bound to a locale, with {var} interpolation. */
export function useTranslations(lang: Lang) {
  return function t(key: UIKey, vars?: Record<string, string | number>): string {
    let s: string = ui[lang][key] ?? ui[defaultLang][key];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

/** Prefix a root-relative path with the locale (default locale gets no prefix). */
export function localizedPath(path: string, lang: Lang): string {
  if (lang === defaultLang) return path;
  return path === "/" ? `/${lang}` : `/${lang}${path}`;
}

/** Strip any locale prefix from a path, returning the canonical English path. */
export function stripLocale(path: string): string {
  const parts = path.split("/");
  if (parts[1] && parts[1] in ui && parts[1] !== defaultLang) {
    return "/" + parts.slice(2).join("/");
  }
  return path;
}
