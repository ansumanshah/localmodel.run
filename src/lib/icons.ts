// Icon mapping for makers (model.family), devices (DeviceCategory) and OS
// (Platform). Names resolve against the installed @iconify-json/simple-icons and
// @iconify-json/lucide sets via astro-icon. `icon: null` means render a lettered
// chip with `initials` instead (used for makers with no brand mark). Every name
// here was verified to exist in the installed sets, so the build cannot break on
// a missing icon. Keep that invariant when adding rows.

import type { DeviceCategory, Platform } from "@/data/types";

export interface IconSpec {
  /** astro-icon name (e.g. "simple-icons:meta"), or null to use a lettered chip. */
  icon: string | null;
  /** Human label, used for aria-label and tooltips. */
  label: string;
  /** Fallback initials when icon is null. */
  initials?: string;
}

/** Resolve a model's `family` string to the lab that made it. */
export function makerForFamily(family: string): IconSpec {
  const f = family.toLowerCase();
  if (f.includes("tinyllama")) return { icon: null, label: "TinyLlama", initials: "TL" };
  if (f.includes("llama")) return { icon: "simple-icons:meta", label: "Meta" };
  if (f.includes("deepseek")) return { icon: "simple-icons:deepseek", label: "DeepSeek" };
  if (f.includes("qwen")) return { icon: "simple-icons:qwen", label: "Qwen, by Alibaba" };
  if (f.includes("gemma")) return { icon: "simple-icons:google", label: "Google" };
  if (f.includes("phi")) return { icon: "simple-icons:microsoft", label: "Microsoft" };
  if (f.includes("mistral") || f.includes("mixtral"))
    return { icon: "simple-icons:mistralai", label: "Mistral AI" };
  if (f.includes("granite")) return { icon: "simple-icons:ibm", label: "IBM" };
  if (f.includes("smollm")) return { icon: "simple-icons:huggingface", label: "Hugging Face" };
  if (f.includes("sarvam")) return { icon: null, label: "Sarvam AI", initials: "S" };
  // Image / video / audio makers. Whisper (OpenAI) and MusicGen (Meta) have
  // marks in the installed simple-icons set; the rest fall back to a lettered
  // chip with the lab's name as the label (no missing-icon build risk).
  if (f.includes("whisper")) return { icon: "simple-icons:openai", label: "OpenAI" };
  if (f.includes("musicgen")) return { icon: "simple-icons:meta", label: "Meta" };
  if (f.includes("stable-diffusion")) return { icon: null, label: "Stability AI", initials: "SD" };
  if (f.includes("stable-audio")) return { icon: null, label: "Stability AI", initials: "SA" };
  if (f.includes("flux")) return { icon: null, label: "Black Forest Labs", initials: "FX" };
  if (f.includes("kokoro")) return { icon: null, label: "Kokoro", initials: "KO" };
  if (f.includes("bark")) return { icon: null, label: "Suno", initials: "BK" };
  if (f.includes("orpheus")) return { icon: null, label: "Canopy Labs", initials: "OR" };
  if (f.includes("dia")) return { icon: null, label: "Nari Labs", initials: "DI" };
  if (f.includes("wan")) return { icon: null, label: "Wan, by Alibaba", initials: "WA" };
  if (f.includes("ltx")) return { icon: null, label: "Lightricks", initials: "LX" };
  if (f.includes("cogvideo")) return { icon: null, label: "Zhipu AI", initials: "CV" };
  if (f.includes("hunyuan")) return { icon: null, label: "Tencent", initials: "HY" };
  if (f.includes("mochi")) return { icon: null, label: "Genmo", initials: "MO" };
  return { icon: null, label: family, initials: family.slice(0, 2).toUpperCase() };
}

/** Resolve a device category to its vendor/form-factor mark. */
export function deviceIconSpec(category: DeviceCategory): IconSpec {
  switch (category) {
    case "mac":
      return { icon: "simple-icons:apple", label: "Apple Silicon Mac" };
    case "iphone":
      return { icon: "simple-icons:apple", label: "iPhone or iPad" };
    case "nvidia":
      return { icon: "simple-icons:nvidia", label: "NVIDIA GPU" };
    case "amd":
      return { icon: "simple-icons:amd", label: "AMD GPU" };
    case "intel":
      return { icon: "simple-icons:intel", label: "Intel" };
    case "android":
      return { icon: "simple-icons:android", label: "Android" };
    case "laptop":
      return { icon: "lucide:laptop", label: "Laptop" };
    default:
      return { icon: "lucide:cpu", label: "Device" };
  }
}

/** Resolve an OS platform to its logo. */
export function osIconSpec(platform: Platform): IconSpec {
  switch (platform) {
    case "mac":
      return { icon: "simple-icons:apple", label: "macOS" };
    case "ios":
      return { icon: "simple-icons:apple", label: "iOS" };
    case "windows":
      return { icon: "simple-icons:windows", label: "Windows" };
    case "linux":
      return { icon: "simple-icons:linux", label: "Linux" };
    case "android":
      return { icon: "simple-icons:android", label: "Android" };
    default:
      return { icon: "lucide:cpu", label: "OS" };
  }
}
