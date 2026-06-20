/* Gauge·Glass — shared micro-interactions. Transform/opacity/CSS-vars only.
 *
 * Ported from the design bundle's glass.js, with three adaptations for this
 * Astro app:
 *   1. Runs on `astro:page-load` (initial load + every view-transition swap),
 *      not just DOMContentLoaded.
 *   2. Per-element + per-document bind guards so re-running on navigation never
 *      double-binds (the header/footer persist across swaps).
 *   3. NO theme toggle here — Header.astro already owns `#theme-toggle` +
 *      `localStorage.theme`. Binding `[data-toggle-theme]` too would fight it.
 *
 * Every motion is gated on prefers-reduced-motion at the CSS layer; the JS also
 * checks it before applying transform tilt/magnetic offsets.
 */
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function initGlass(): void {
  const rm = reduceMotion();

  // Moving-spotlight layer on every .spotlight surface.
  document.querySelectorAll<HTMLElement>(".spotlight").forEach((el) => {
    if (!el.querySelector(":scope > .spot")) {
      const s = document.createElement("span");
      s.className = "spot";
      el.insertBefore(s, el.firstChild);
    }
    if (el.dataset.glassSpot) return;
    el.dataset.glassSpot = "1";
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
      el.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
    });
  });

  // Collectible-card tilt + sheen tracking.
  document.querySelectorAll<HTMLElement>(".rig-card[data-tilt]").forEach((card) => {
    if (card.dataset.glassTilt) return;
    card.dataset.glassTilt = "1";
    const stage = (card.closest(".rig-stage") as HTMLElement) || card;
    const max = parseFloat(getComputedStyle(card).getPropertyValue("--rig-tilt")) || 9;
    stage.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.setProperty("--mx", px * 100 + "%");
      card.style.setProperty("--my", py * 100 + "%");
      if (!reduceMotion()) {
        card.style.setProperty("--ry", (px - 0.5) * max * 2 + "deg");
        card.style.setProperty("--rx", -(py - 0.5) * max * 2 + "deg");
      }
    });
    stage.addEventListener("pointerleave", () => {
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
      card.style.setProperty("--mx", "50%");
      card.style.setProperty("--my", "50%");
    });
  });

  // Magnetic buttons (skip entirely under reduced-motion).
  if (!rm) {
    document.querySelectorAll<HTMLElement>(".magnetic").forEach((btn) => {
      if (btn.dataset.glassMag) return;
      btn.dataset.glassMag = "1";
      const R = 14;
      btn.addEventListener("pointermove", (e) => {
        const r = btn.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        btn.style.transform =
          "translate(" +
          Math.max(-R, Math.min(R, dx * 0.3)) +
          "px," +
          Math.max(-R, Math.min(R, dy * 0.3)) +
          "px)";
      });
      btn.addEventListener("pointerleave", () => {
        btn.style.transform = "";
      });
    });
  }

  // Count-up on .num[data-count] when scrolled into view.
  const counters = document.querySelectorAll<HTMLElement>(
    ".num[data-count]:not([data-glass-count])",
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
      c.dataset.glassCount = "1";
      io.observe(c);
    });
  }

  // Copy-to-clipboard on command chips.
  document.querySelectorAll<HTMLElement>(".cmd-chip .copy").forEach((b) => {
    if (b.dataset.glassCopy) return;
    b.dataset.glassCopy = "1";
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

  // Holographic card sheen tracking (no tilt) — .card-holo[data-holo].
  document.querySelectorAll<HTMLElement>(".card-holo[data-holo]").forEach((card) => {
    if (card.dataset.glassHolo) return;
    card.dataset.glassHolo = "1";
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
      card.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
    });
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--mx", "50%");
      card.style.setProperty("--my", "50%");
    });
  });

  // How-it-works diagram: add .in to start the SVG line-draw when scrolled in.
  const diagrams = document.querySelectorAll<SVGElement>(".hiw-diagram:not([data-glass-hiw])");
  if (diagrams.length) {
    diagrams.forEach((d) => {
      d.setAttribute("data-glass-hiw", "1");
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

  // Colorful maker badges — harmonized hue per maker (same L/C, varied hue).
  document.querySelectorAll<HTMLElement>(".maker, .r-maker").forEach((el) => {
    if (el.dataset.glassMaker) return;
    el.dataset.glassMaker = "1";
    const c = (el.textContent || "?").trim().charCodeAt(0) || 63;
    el.style.background = "oklch(0.58 0.15 " + ((c * 47) % 360) + ")";
    el.style.color = "#fff";
  });

  // Optional degraded-mode toggle (no-op when no control is present). Theme
  // toggle is intentionally NOT bound here — Header.astro owns it.
  const root = document.documentElement;
  if (localStorage.getItem("lm-glass") === "degraded") root.classList.add("degraded");
  document.querySelectorAll<HTMLElement>("[data-toggle-glass]").forEach((b) => {
    if (b.dataset.glassToggle) return;
    b.dataset.glassToggle = "1";
    const sync = () =>
      b.setAttribute("aria-pressed", root.classList.contains("degraded") ? "true" : "false");
    sync();
    b.addEventListener("click", () => {
      root.classList.toggle("degraded");
      try {
        localStorage.setItem("lm-glass", root.classList.contains("degraded") ? "degraded" : "full");
      } catch {
        /* private mode */
      }
      sync();
    });
  });

  bindModals();
}

/* ── Modal: [data-modal-open="id"] opens #id (.gscrim); backdrop / [data-modal-close] / Esc close.
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
    if (t.dataset.glassModalOpen) return;
    t.dataset.glassModalOpen = "1";
    t.addEventListener("click", () => {
      const m = document.getElementById(t.getAttribute("data-modal-open") || "");
      if (m) openModal(m);
    });
  });
  document.querySelectorAll<HTMLElement>(".gscrim").forEach((m) => {
    if (m.dataset.glassModal) return;
    m.dataset.glassModal = "1";
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
    __glassBound?: boolean;
  }
}

if (!window.__glassBound) {
  window.__glassBound = true;
  // Esc closes any open modal (document-level, bound once).
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape")
      document.querySelectorAll<HTMLElement>(".gscrim[data-open]").forEach(closeModal);
  });
}

// Initial load + after every Astro view-transition navigation.
initGlass();
document.addEventListener("astro:page-load", initGlass);

export {};
