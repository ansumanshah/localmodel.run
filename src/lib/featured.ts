// Curated front-page subsets (the highest-search models/devices). Kept free of
// imports so astro.config (via sitemap-policy) can read it without path aliases.
export const FEATURED_MODEL_IDS = [
  "llama-3.1-8b",
  "deepseek-r1-distill-qwen-7b",
  "qwen3-8b",
  "gemma-3-4b",
  "llama-3.3-70b",
  "qwen3-30b-a3b",
];
export const FEATURED_DEVICE_IDS = [
  "apple-m4-16gb",
  "apple-m4-pro-48gb",
  "nvidia-rtx-4090-24gb",
  "nvidia-rtx-3060-12gb",
  "laptop-16gb",
  "iphone-16-pro",
];
