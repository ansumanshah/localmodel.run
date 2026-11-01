const EVENTS = new Set([
  "fit_check", "setup_open", "install_click", "command_copy",
  "demo_load_started", "demo_loaded", "demo_failed", "demo_succeeded",
  "setup_worked", "setup_blocked",
]);

/** Persist only the QA opt-out boolean, including across Astro navigation. */
export function syncAnalyticsOptOut(): boolean {
  try {
    const qa = new URLSearchParams(window.location.search).get("qa") ??
      new URLSearchParams(window.location.hash.slice(1)).get("qa");
    if (qa === "1") window.sessionStorage.setItem("lmr:qa", "1");
    if (qa === "0") window.sessionStorage.removeItem("lmr:qa");
    return window.location.origin !== "https://localmodel.run" ||
      navigator.webdriver || navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true ||
      window.sessionStorage.getItem("lmr:qa") === "1";
  } catch {
    return true;
  }
}

/** Action names only: no identifiers, URL, device, model, or user content. */
export async function trackEvent(name: string): Promise<void> {
  try {
    if (import.meta.env.PUBLIC_ACTION_EVENTS !== "1" || !EVENTS.has(name) || syncAnalyticsOptOut()) return;
    await fetch("/_actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: [{ client: { __zarazTrack: name } }] }),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      keepalive: true,
    });
  } catch {
    // Analytics must never interrupt the action it records.
  }
}
