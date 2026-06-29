import type { ModelRow } from "@/data/types";

// Task / use-case tags, DERIVED from a model's own naming, subtype and family — a
// classification of what the model is built for (Qwen3-Coder is a coding model by
// name; DeepSeek-R1 is a reasoning model by design), NOT a new sourced metric. We
// never invent a benchmark number here; we just surface the model's stated purpose.

export type UseCase = "coding" | "reasoning" | "vision" | "multilingual";

export const USE_CASES: UseCase[] = ["coding", "reasoning", "vision", "multilingual"];

export const USE_CASE_META: Record<UseCase, { label: string; title: string; blurb: string; opener: string }> = {
  coding: {
    label: "Coding",
    title: "coding",
    blurb: "Models tuned for code generation and agentic coding (SWE-bench, fill-in-the-middle).",
    opener: "Every model here is trained to write code, not just chat about it.",
  },
  reasoning: {
    label: "Reasoning",
    title: "reasoning",
    blurb: "Models that think step by step before answering, for math, logic and planning.",
    opener: "These models think step by step before they answer, which helps on math and logic and costs more time per reply.",
  },
  vision: {
    label: "Vision",
    title: "vision (multimodal)",
    blurb: "Models that accept images as input alongside text.",
    opener: "These models read images as input, so you can ask about a screenshot or a photo, not only text.",
  },
  multilingual: {
    label: "Multilingual",
    title: "multilingual",
    blurb: "Models with language-first training beyond English (Indic, Korean, Chinese).",
    opener: "These models are trained beyond English, so they hold up in Indic, Korean, or Chinese where an English-first model drifts.",
  },
};

export function useCasesFor(m: ModelRow): UseCase[] {
  const s = `${m.id} ${m.name} ${m.family}`.toLowerCase();
  const out: UseCase[] = [];
  if (m.subtype === "coder" || /coder|devstral|(^|[^a-z])code([^a-z]|$)/.test(s))
    out.push("coding");
  if (/(^|[^a-z])r1([^a-z]|$)|reasoning|magistral|qwq|thinking|nemotron/.test(s))
    out.push("reasoning");
  if (m.subtype === "vlm" || /vision|(^|[^a-z])vl([^a-z]|$)/.test(s)) out.push("vision");
  if (/sarvam|exaone|ernie/.test(s)) out.push("multilingual");
  return out;
}
