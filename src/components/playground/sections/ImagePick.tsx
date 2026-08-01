import { useRef, useState, type DragEvent } from "react";

interface ImagePickProps {
  disabled: boolean;
  /** Object URL (or same-origin URL) of the chosen image. */
  onPick: (url: string) => void;
  /** Optional same-origin sample image offered as a one-click fallback. */
  sampleUrl?: string;
  sampleLabel?: string;
}

// Shared file-input + drag-drop for the image tasks. Images stay in the tab
// as object URLs; nothing uploads.
export default function ImagePick({ disabled, onPick, sampleUrl, sampleLabel }: ImagePickProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function pickFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    onPick(url);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!disabled) pickFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div>
      <button
        type="button"
        className={`pg-drop${dragOver ? " pg-drop--over" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        disabled={disabled}
      >
        Drop an image here or click to choose one
        <span className="mt-1 block text-xs text-muted-foreground">Stays in this tab; never uploaded.</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Choose an image"
        onChange={(e) => pickFile(e.target.files?.[0] ?? undefined)}
        disabled={disabled}
      />
      {sampleUrl && (
        <button type="button" className="btn mt-2 text-xs" onClick={() => onPick(sampleUrl)} disabled={disabled}>
          {sampleLabel ?? "Use a sample image"}
        </button>
      )}
    </div>
  );
}
