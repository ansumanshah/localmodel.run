import { estimateApiCost, formatApiCost } from "@/lib/api-cost";
import type { ApiPricing } from "@/lib/api-cost";

function readMillion(input: HTMLInputElement): number | null {
  if (input.value.trim() === "") return null;
  const value = Number(input.value);
  return Number.isFinite(value) && value >= 0 && value <= 1_000_000 ? value : null;
}

class ApiPricingCatalogElement extends HTMLElement {
  private controller?: AbortController;

  connectedCallback() {
    this.controller?.abort();
    const input = this.querySelector<HTMLInputElement>("#api-pricing-input");
    const output = this.querySelector<HTMLInputElement>("#api-pricing-output");
    const provider = this.querySelector<HTMLSelectElement>("#api-pricing-provider");
    const summary = this.querySelector<HTMLElement>("#api-pricing-summary");
    const note = this.querySelector<HTMLElement>("#api-pricing-note");
    if (!input || !output || !provider || !summary || !note) return;

    const abort = new AbortController();
    this.controller = abort;
    const rows = Array.from(this.querySelectorAll<HTMLTableRowElement>("[data-api-pricing-row]"));
    const render = () => {
      const inputM = readMillion(input);
      const outputM = readMillion(output);
      const valid = inputM != null && outputM != null;
      const visible = rows.filter((row) => {
        const show = provider.value === "all" || row.dataset.provider === provider.value;
        row.hidden = !show;
        const cell = row.querySelector<HTMLElement>("[data-api-cost]");
        if (cell) {
          let pricing: ApiPricing | null = null;
          try { pricing = row.dataset.pricing ? JSON.parse(row.dataset.pricing) as ApiPricing : null; } catch { /* unavailable */ }
          cell.textContent = valid ? formatApiCost(estimateApiCost(pricing, inputM!, outputM!)) : "Unavailable";
        }
        return show;
      });
      summary.textContent = `Showing ${visible.length} hosted model${visible.length === 1 ? "" : "s"}.`;
      note.textContent = valid
        ? "Estimates use uncached standard input and billed output rates. They exclude cache writes, tools, subscriptions, discounts, taxes and request-length surcharges. Expired rates are unavailable."
        : "Enter non-negative monthly token volumes up to 1,000,000 million tokens to calculate estimates.";
    };

    provider.addEventListener("change", render, { signal: abort.signal });
    input.addEventListener("input", render, { signal: abort.signal });
    output.addEventListener("input", render, { signal: abort.signal });
    render();
  }

  disconnectedCallback() { this.controller?.abort(); }
}

if (!customElements.get("api-pricing-catalog")) customElements.define("api-pricing-catalog", ApiPricingCatalogElement);
