import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { syncAnalyticsOptOut, trackEvent } from "./analytics";

const original = new Map(["window", "navigator", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalEnabled = process.env.PUBLIC_ACTION_EVENTS;
let storage: Map<string, string>;
let location: { origin: string; search: string; hash: string };
let privacy: { webdriver: boolean; doNotTrack: string; globalPrivacyControl: boolean };
let send: ReturnType<typeof mock>;

beforeEach(() => {
  process.env.PUBLIC_ACTION_EVENTS = "1";
  storage = new Map();
  location = { origin: "https://localmodel.run", search: "", hash: "" };
  privacy = { webdriver: false, doNotTrack: "", globalPrivacyControl: false };
  send = mock(async () => new Response(null, { status: 204 }));
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location,
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: privacy });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: send });
});

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.PUBLIC_ACTION_EVENTS;
  else process.env.PUBLIC_ACTION_EVENTS = originalEnabled;
  for (const [key, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

describe("cookie-free action analytics", () => {
  test("sends only the allowlisted name and never browser context", async () => {
    location.search = "?model=private-model&prompt=secret";
    location.hash = "#device=private-device";
    expect(send).not.toHaveBeenCalled();
    await trackEvent("setup_open");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual(["/_actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"events":[{"client":{"__zarazTrack":"setup_open"}}]}',
      credentials: "omit", referrerPolicy: "no-referrer", keepalive: true,
    }]);
    expect(storage.size).toBe(0);
  });

  test("sends nothing until the collector is activated", async () => {
    delete process.env.PUBLIC_ACTION_EVENTS;
    await trackEvent("setup_open");
    expect(send).not.toHaveBeenCalled();
  });

  test("rejects arbitrary event names", async () => {
    await trackEvent("prompt=secret");
    await trackEvent("__proto__");
    expect(send).not.toHaveBeenCalled();
  });

  test.each([
    "fit_check", "setup_open", "install_click", "command_copy", "demo_load_started",
    "demo_loaded", "demo_failed", "demo_succeeded", "setup_worked", "setup_blocked",
  ])("accepts %s", async (name) => {
    await trackEvent(name);
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0][1].body)).toEqual({ events: [{ client: { __zarazTrack: name } }] });
  });

  test.each(["http://localhost:4321", "https://preview.localmodel-run.pages.dev", "https://www.localmodel.run", "http://localmodel.run"])("skips nonproduction origin %s", async (origin) => {
    location.origin = origin;
    await trackEvent("fit_check");
    expect(send).not.toHaveBeenCalled();
  });

  test.each(["webdriver", "doNotTrack", "globalPrivacyControl"])("honors %s", async (key) => {
    Object.assign(privacy, { [key]: key === "doNotTrack" ? "1" : true });
    await trackEvent("fit_check");
    expect(send).not.toHaveBeenCalled();
  });

  test.each(["search", "hash"])("persists QA from %s and qa=0 clears it", async (source) => {
    location[source as "search" | "hash"] = source === "search" ? "?qa=1" : "#qa=1";
    expect(syncAnalyticsOptOut()).toBe(true);
    location.search = "";
    location.hash = "";
    await trackEvent("setup_open");
    expect(send).not.toHaveBeenCalled();
    expect([...storage]).toEqual([["lmr:qa", "1"]]);
    location[source as "search" | "hash"] = source === "search" ? "?qa=0" : "#qa=0";
    await trackEvent("setup_open");
    expect(send).toHaveBeenCalledTimes(1);
    expect(storage.size).toBe(0);
  });

  test("ignores a failed request", async () => {
    send.mockImplementation(() => Promise.reject(new Error("blocked")));
    await expect(trackEvent("demo_loaded")).resolves.toBeUndefined();
  });

  test("skips safely when storage is blocked", async () => {
    Object.defineProperty(window, "sessionStorage", { get() { throw new Error("blocked"); } });
    await expect(trackEvent("command_copy")).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});
