// Mic capture + decode to what whisper expects: mono Float32Array at 16 kHz.
// An AudioContext constructed with { sampleRate: 16000 } resamples on
// decodeAudioData, which is the same approach the official whisper-web
// example uses; channels are averaged to mono.

export const WHISPER_SAMPLE_RATE = 16000;

export async function blobToMono16k(blob: Blob): Promise<{ audio: Float32Array; seconds: number }> {
  const Ctor: typeof AudioContext =
    window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
  const ctx = new Ctor({ sampleRate: WHISPER_SAMPLE_RATE });
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    let audio: Float32Array;
    if (buf.numberOfChannels > 1) {
      // Same stereo merge the reference whisper-web implementation uses:
      // average scaled by sqrt(2) to preserve signal energy.
      const SCALING_FACTOR = Math.SQRT2;
      const left = buf.getChannelData(0);
      const right = buf.getChannelData(1);
      audio = new Float32Array(left.length);
      for (let i = 0; i < left.length; i += 1) audio[i] = (SCALING_FACTOR * (left[i] + right[i])) / 2;
    } else {
      audio = buf.getChannelData(0);
    }
    return { audio, seconds: buf.duration };
  } finally {
    void ctx.close();
  }
}

export interface Recorder {
  stop(): Promise<Blob>;
  cancel(): void;
}

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  rec.start();
  const teardown = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          teardown();
          resolve(new Blob(chunks, { type: rec.mimeType }));
        };
        rec.stop();
      }),
    cancel: () => {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      teardown();
    },
  };
}
