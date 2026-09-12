import { estimateApiCost, formatApiCost } from "@/lib/api-cost";
import type { CloudComparison } from "@/lib/cloud-comparison";

type Pricing = NonNullable<CloudComparison["rows"][number]["pricing"]>;

function readNumber(input: HTMLInputElement): number | null {
  if (input.value.trim() === "") return null;
  const value = Number(input.value);
  return Number.isFinite(value) && value >= 0 && value <= 1_000_000 ? value : null;
}

class CloudComparisonElement extends HTMLElement {
  private controller?: AbortController;

  connectedCallback() {
    this.controller?.abort();
    const dataNode = document.querySelector<HTMLScriptElement>("#cloud-comparison-data");
    if (!dataNode?.textContent) return;

    let comparison: CloudComparison;
    try { comparison = JSON.parse(dataNode.textContent) as CloudComparison; } catch { return; }
    const device = this.querySelector<HTMLSelectElement>("#cloud-device");
    const context = this.querySelector<HTMLSelectElement>("#cloud-context");
    const filter = this.querySelector<HTMLSelectElement>("#cloud-filter");
    const input = this.querySelector<HTMLInputElement>("#cloud-input");
    const output = this.querySelector<HTMLInputElement>("#cloud-output");
    const summary = this.querySelector<HTMLElement>("#cloud-summary");
    const note = this.querySelector<HTMLElement>("#cloud-cost-note");
    if (!device || !context || !filter || !input || !output || !summary || !note) return;

    const abort = new AbortController();
    this.controller = abort;
    const rows = Array.from(this.querySelectorAll<HTMLTableRowElement>("[data-cloud-row]"));
    const render = () => {
      const selectedDevice = comparison.devices.find((item) => item.id === device.value);
      const contextKey = context.value;
      const visible = rows.filter((row) => {
        const show = filter.value === "all" || row.dataset.access === filter.value;
        row.hidden = !show;
        const modelId = row.dataset.modelId;
        const fitCell = row.querySelector<HTMLElement>("[data-fit-cell]");
        if (row.dataset.access === "local" && modelId && fitCell && selectedDevice) {
          const fit = comparison.fits[modelId]?.[selectedDevice.id]?.[contextKey];
          fitCell.replaceChildren();
          if (fit) {
            const chip = document.createElement("span");
            chip.className = `fit-chip fit-${fit.verdict}`;
            const label = document.createElement("span");
            label.textContent = fit.verdict === "yes" ? "Fits" : fit.verdict === "tight" ? "Tight" : "No fit";
            const memory = document.createElement("span");
            memory.className = "num";
            memory.textContent = `~${fit.memoryGb} GB`;
            chip.append(label, memory);
            const link = document.createElement("a");
            link.href = fit.pairUrl;
            link.className = "block mt-1 text-xs underline underline-offset-2";
            link.textContent = "4K setup details";
            fitCell.append(chip, link);
          } else fitCell.textContent = "Not available";
        }
        return show;
      });
      summary.textContent = `Showing ${visible.length} selected model${visible.length === 1 ? "" : "s"}. Local fit uses ${selectedDevice?.name ?? "the selected device"} at ${contextKey}K context.`;

      const inputM = readNumber(input);
      const outputM = readNumber(output);
      const valid = inputM != null && outputM != null;
      for (const row of rows) {
        const cell = row.querySelector<HTMLElement>("[data-cost-cell]");
        if (!cell || !row.dataset.pricing) continue;
        let pricing: Pricing | null = null;
        try { pricing = JSON.parse(row.dataset.pricing) as Pricing; } catch { /* invalid data remains unavailable */ }
        cell.textContent = valid && pricing ? formatApiCost(estimateApiCost(pricing, inputM!, outputM!)) : "Unavailable";
        cell.classList.add("num");
      }
      note.textContent = valid
        ? "Estimates use standard-tier uncached input and billed output rates. They exclude cache reads and writes, tools, batch or priority discounts, long-request surcharges and taxes. Known expired rates show Unavailable. Follow each price link for vendor notes."
        : "Enter non-negative monthly input and billed-output values up to 1,000,000 to calculate estimates.";
    };

    for (const control of [device, context, filter]) control.addEventListener("change", render, { signal: abort.signal });
    for (const control of [input, output]) control.addEventListener("input", render, { signal: abort.signal });
    render();
  }

  disconnectedCallback() { this.controller?.abort(); }
}

if (!customElements.get("cloud-comparison")) customElements.define("cloud-comparison", CloudComparisonElement);
