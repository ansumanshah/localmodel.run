import { browserModels } from "./data";
import { playgroundRunConfig, playgroundTaskFor } from "@/components/playground/registry";
import type { PlaygroundTask } from "@/components/playground/types";

const tasks = [
  {
    modelId: "modnet",
    runner: "rmbg" as PlaygroundTask,
    title: "Remove a portrait background",
    description: "Choose a portrait photo and download a transparent PNG. The image stays in your browser.",
    steps: ["Choose a portrait photo or use the sample to preview it without loading a model.", "Press Remove background to load the model and process your photo on this device.", "Compare the result, check the edges, then download the transparent PNG."],
    caveat: "This model is designed for portraits. Hair, transparent objects and busy backgrounds can need manual cleanup.",
    package: "@huggingface/transformers",
    docs: "https://huggingface.co/docs/transformers.js/api/pipelines#module_pipelines.BackgroundRemovalPipeline",
    code: `import { pipeline } from "@huggingface/transformers";

const removeBackground = await pipeline("background-removal", "Xenova/modnet", {
  device: "wasm",
  dtype: "uint8",
});

// imageUrl: an object URL from a local File, or a same-origin image URL.
export async function cutout(imageUrl) {
  const result = await removeBackground(imageUrl);
  const image = Array.isArray(result) ? result[0] : result;
  return image.toBlob("image/png");
}`,
  },
  {
    modelId: "whisper-tiny",
    runner: "asr" as PlaygroundTask,
    title: "Turn speech into text",
    description: "Record a short voice note, review the transcript, then copy or download the text.",
    steps: ["Press Run below to load the speech model.", "Record from your microphone, then press Stop and transcribe. You can also try the sample clip.", "Review the transcript for mistakes, then copy it or download a text file."],
    caveat: "Use short, clear recordings. Names, accents and background noise can lead to mistakes; review the output before using it.",
    package: "@huggingface/transformers",
    docs: "https://huggingface.co/docs/transformers.js/api/pipelines#module_pipelines.AutomaticSpeechRecognitionPipeline",
    code: `import { pipeline } from "@huggingface/transformers";

const transcriber = await pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny", {
  device: "wasm",
  dtype: "fp32",
});

// audioUrl: an object URL from a local audio File, or a same-origin audio URL.
export async function transcribe(audioUrl) {
  const result = await transcriber(audioUrl);
  return result.text;
}`,
  },
  {
    modelId: "kokoro-82m",
    runner: "tts" as PlaygroundTask,
    title: "Turn text into speech",
    description: "Type a short passage, choose a voice, and listen to or download the generated audio.",
    steps: ["Press Run below to load the voice model.", "Enter a short passage, choose a voice, and press Speak.", "Listen to the result, then download the WAV file."],
    caveat: "The voices offered here are English voices. Pronunciation and expression can vary; try a short passage first.",
    package: "kokoro-js",
    docs: "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX",
    code: `import { KokoroTTS } from "kokoro-js";

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
  device: "wasm",
  dtype: "q8",
});

export async function speak(text) {
  const audio = await tts.generate(text, { voice: "af_heart" });
  return audio.toBlob();
}`,
  },
];

export const localTasks = tasks.map((task) => {
  const model = browserModels.find((row) => row.id === task.modelId);
  if (!model || playgroundTaskFor(model) !== task.runner) {
    throw new Error(`Local task has no supported runner: ${task.modelId}`);
  }
  return { ...task, model, run: playgroundRunConfig(model), href: `/browser/${model.id}` };
});
