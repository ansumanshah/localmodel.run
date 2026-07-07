/* The Calibrated Instrument — shared micro-interactions.
 *
 * The instrument rule: a needle moves once, settles, and stops. Everything
 * cursor-following from the surface era (spotlight, tilt, magnetic pull, holo
 * sheen) is DELETED here, not gated off — an instrument that shimmers at rest
 * is not trustworthy. What remains is one-shot: count-ups that settle, the
 * line-draw diagram, copy feedback, and the modal plumbing.
 *
 * Astro adaptations kept from the previous layer:
 *   1. Runs on `astro:page-load` (initial load + every view-transition swap).
 *   2. Per-element + per-document bind guards so re-running never double-binds.
 *   3. NO theme toggle here — Header.astro owns `#theme-toggle`.
 */
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Haptic tick. Web vibration exists on Android Chrome only (iOS Safari exposes
 * no vibration API), so this is a progressive nicety: a short pulse on press,
 * distinct patterns for the quiz via window.lmrBuzz. Skipped under
 * prefers-reduced-motion; silently a no-op everywhere unsupported. */
const buzz = (pattern: number | number[]): void => {
  if (reduceMotion()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
};

function initInteractions(): void {
  // Count-up on .num[data-count] when scrolled into view.
  const counters = document.querySelectorAll<HTMLElement>(
    ".num[data-count]:not([data-init-count])",
  );
  if (counters.length) {
    const fmtNum = (n: number, dec: number) =>
      Number(n.toFixed(dec)).toLocaleString("en-US", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          const el = en.target as HTMLElement;
          const to = parseFloat(el.getAttribute("data-count") || "0");
          const dec = parseInt(el.getAttribute("data-dec") || "0", 10) || 0;
          if (reduceMotion()) {
            el.textContent = fmtNum(to, dec);
            return;
          }
          const t0 = performance.now();
          const dur = 750;
          const tick = (now: number) => {
            const p = Math.min(1, (now - t0) / dur);
            const e = 1 - Math.pow(1 - p, 3);
            el.textContent = fmtNum(to * e, dec);
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.5 },
    );
    counters.forEach((c) => {
      c.dataset.initCount = "1";
      io.observe(c);
    });
  }

  // Copy-to-clipboard on command chips.
  document.querySelectorAll<HTMLElement>(".cmd-chip .copy").forEach((b) => {
    if (b.dataset.initCopy) return;
    b.dataset.initCopy = "1";
    b.addEventListener("click", () => {
      const chip = b.closest(".cmd-chip");
      if (!chip) return;
      const txt =
        chip.getAttribute("data-cmd") ||
        (chip.textContent || "").replace(/\s*copy\s*$/i, "").trim();
      if (navigator.clipboard) navigator.clipboard.writeText(txt);
      const old = b.textContent;
      b.textContent = "copied";
      setTimeout(() => {
        b.textContent = old;
      }, 1200);
    });
  });

  // How-it-works diagram: add .in to start the SVG line-draw when scrolled in.
  const diagrams = document.querySelectorAll<SVGElement>(".hiw-diagram:not([data-init-hiw])");
  if (diagrams.length) {
    diagrams.forEach((d) => {
      d.setAttribute("data-init-hiw", "1");
      d.querySelectorAll<SVGPathElement>("path.draw").forEach((p) => {
        try {
          p.style.setProperty("--len", String(p.getTotalLength()));
        } catch {
          /* getTotalLength unsupported (jsdom); diagram just shows statically */
        }
      });
    });
    const dio = new IntersectionObserver(
      (es) => {
        es.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            dio.unobserve(en.target);
          }
        });
      },
      { threshold: 0.4 },
    );
    diagrams.forEach((d) => dio.observe(d));
  }

  bindModals();
}

/* ── Modal: [data-modal-open="id"] opens #id (.scrim); backdrop / [data-modal-close] / Esc close.
 * Document-level listeners bind once (window flag); per-modal Tab-trap binds per element. */
let lastFocus: HTMLElement | null = null;
function focusables(m: Element): HTMLElement[] {
  return Array.prototype.slice
    .call(
      m.querySelectorAll(
        'a[href],button:not([disabled]),select,input,[tabindex]:not([tabindex="-1"])',
      ),
    )
    .filter((el: HTMLElement) => el.offsetParent !== null);
}
function openModal(m: HTMLElement): void {
  lastFocus = document.activeElement as HTMLElement;
  m.setAttribute("data-open", "");
  document.documentElement.style.overflow = "hidden";
  const f = focusables(m);
  if (f.length) setTimeout(() => f[0].focus(), 30);
}
function closeModal(m: HTMLElement): void {
  m.removeAttribute("data-open");
  document.documentElement.style.overflow = "";
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function bindModals(): void {
  document.querySelectorAll<HTMLElement>("[data-modal-open]").forEach((t) => {
    if (t.dataset.initModalOpen) return;
    t.dataset.initModalOpen = "1";
    t.addEventListener("click", () => {
      const m = document.getElementById(t.getAttribute("data-modal-open") || "");
      if (m) openModal(m);
    });
  });
  document.querySelectorAll<HTMLElement>(".scrim").forEach((m) => {
    if (m.dataset.initModal) return;
    m.dataset.initModal = "1";
    m.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const f = focusables(m);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
    m.addEventListener("click", (e) => {
      const tgt = e.target as HTMLElement;
      if (tgt === m || tgt.closest("[data-modal-close]")) closeModal(m);
    });
  });
}

declare global {
  interface Window {
    __initBound?: boolean;
    lmrBuzz?: (pattern: number | number[]) => void;
  }
}

if (!window.__initBound) {
  window.__initBound = true;
  // Esc closes any open modal (document-level, bound once).
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape")
      document.querySelectorAll<HTMLElement>(".scrim[data-open]").forEach(closeModal);
  });
  // Haptics: one delegated press-tick for every control, bound once.
  window.lmrBuzz = buzz;
  document.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (
        t.closest(
          ".btn, .play-choice, [data-copy], .cmd-chip .copy, .site-header button, .site-header a, .cta-link",
        )
      )
        buzz(8);
    },
    { passive: true },
  );
}

// Initial load + after every Astro view-transition navigation.
initInteractions();
document.addEventListener("astro:page-load", initInteractions);

export {};
