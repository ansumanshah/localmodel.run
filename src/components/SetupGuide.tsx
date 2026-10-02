import { useMemo, useState, type ReactNode } from "react";
import { devices, devicePlatform, hfRepo } from "@/lib/data";
import { setupModels, type SetupTask } from "@/lib/setup";

const TASKS: { value: SetupTask; label: string; help: string }[] = [
  { value: "chat", label: "Chat and writing", help: "Everyday questions, drafting, and summaries." },
  { value: "coding", label: "Coding", help: "Code completion, explanation, and editing." },
  { value: "reasoning", label: "Reasoning", help: "Longer problem solving and analysis." },
];

const DEVICE_LABELS: Record<string, string> = {
  mac: "Apple Silicon Macs",
  nvidia: "NVIDIA GPUs",
  amd: "AMD GPUs",
  intel: "Intel GPUs",
  laptop: "Laptop CPU / integrated graphics",
  iphone: "iPhone and iPad",
  android: "Android",
};

const DEVICE_GROUPS = Object.entries(
  devices.reduce<Record<string, typeof devices>>((groups, device) => {
    (groups[device.category] ||= []).push(device);
    return groups;
  }, {}),
).map(([category, rows]) => ({
  category,
  label: DEVICE_LABELS[category] ?? category,
  rows: [...rows].sort((a, b) => a.memory_gb - b.memory_gb),
}));

function Select({
  id,
  label,
  value,
  displayValue,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string | number;
  displayValue: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="field-label">{label}</span>
      <div className="field">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          {children}
        </select>
        <span className="truncate">{displayValue}</span>
        <svg className="chev size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </div>
    </label>
  );
}

export default function SetupGuide() {
  const [deviceId, setDeviceId] = useState("apple-m4-16gb");
  const [task, setTask] = useState<SetupTask>("chat");
  const [contextK, setContextK] = useState(4);
  const [desktopPlatform, setDesktopPlatform] = useState<"windows" | "linux">("windows");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const device = devices.find((row) => row.id === deviceId) ?? devices[0]!;
  const isConfigurableDesktop = ["nvidia", "amd", "intel", "laptop"].includes(device.category);
  const platform = isConfigurableDesktop ? desktopPlatform : devicePlatform(device);
  const candidates = useMemo(
    () => setupModels(device, task, contextK),
    [device, task, contextK],
  );
  const selected = candidates.find((candidate) => candidate.model.id === selectedModelId) ?? candidates[0];
  const isPhone = platform === "ios" || platform === "android";
  const selectedTask = TASKS.find((entry) => entry.value === task)!;
  const selectedRepo = selected ? hfRepo(selected.model) ?? selected.model.hf_repo : null;

  return (
    <section className="panel-hero" aria-labelledby="setup-guide-title">
      <div className="panel-head">
        <span className="panel-label">Guided setup</span>
        <span className="panel-sub">Memory estimate</span>
      </div>
      <div className="p-4 sm:p-6">
        <h2 id="setup-guide-title" className="m-0 text-[1.5rem] font-semibold tracking-tight">
          Find a local model, then run it
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Start with your device and job. Recommendations use estimated Q4 memory and measured download size. They do not rank model quality or guarantee speed.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">Choose your own hardware below. The initial device is an example, not detected hardware.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Select id="setup-device" label="Your device" value={deviceId} displayValue={device.name} onChange={(value) => { setDeviceId(value); setSelectedModelId(null); }}>
            {DEVICE_GROUPS.map((group) => (
              <optgroup key={group.category} label={group.label}>
                {group.rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </optgroup>
            ))}
          </Select>
          <Select id="setup-task" label="What are you doing?" value={task} displayValue={selectedTask.label} onChange={(value) => { setTask(value as SetupTask); setSelectedModelId(null); }}>
            {TASKS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </Select>
          <Select id="setup-context" label="Context window" value={contextK} displayValue={`${contextK}k tokens`} onChange={(value) => { setContextK(Number(value)); setSelectedModelId(null); }}>
            {[2, 4, 8, 16, 32].map((value) => <option key={value} value={value}>{value}k tokens</option>)}
          </Select>
        </div>

        {isConfigurableDesktop && (
          <div className="mt-4 max-w-sm">
            <Select id="setup-platform" label="Operating system" value={desktopPlatform} displayValue={desktopPlatform === "windows" ? "Windows" : "Linux"} onChange={(value) => setDesktopPlatform(value as "windows" | "linux")}>
              <option value="windows">Windows</option>
              <option value="linux">Linux</option>
            </Select>
          </div>
        )}
        <p className="mt-3 text-sm text-muted-foreground">{selectedTask.help} Context is how much chat and text the runtime keeps available.</p>

        {candidates.length === 0 ? (
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="m-0 text-[1.25rem] font-semibold">No comfortable Q4 fit at this context</h3>
            <p className="mt-2 text-sm text-muted-foreground">Try a shorter context, or use the calculator to inspect a specific model.</p>
            <a href="/calculator" className="btn mt-3">Open calculator</a>
          </div>
        ) : (
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="m-0 text-[1.25rem] font-semibold">Popular models that fit</h3>
            <p className="mt-2 text-sm text-muted-foreground">Ordered by recorded Ollama pulls, not quality scores.</p>
            <div className="mt-3 grid gap-3">
              {candidates.map(({ model, result }) => {
                const estimate = result.estimate;
                const checked = selected?.model.id === model.id;
                return (
                  <label key={model.id} className="flex cursor-pointer items-start gap-3 rounded border border-border bg-card p-3 hover:border-[var(--color-brand)]">
                    <input type="radio" name="setup-model" checked={checked} onChange={() => setSelectedModelId(model.id)} className="mt-1" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{model.name}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        <span className="font-mono tabular-nums">{model.q4_k_m_gb?.toFixed(1)} GB</span> measured Q4 download
                        {estimate && <> · <span className="font-mono tabular-nums">{estimate.totalGb.toFixed(1)} GB</span> estimated memory · <span className="font-mono tabular-nums">{result.headroomGb.toFixed(1)} GB</span> headroom</>}
                      </span>
                    </span>
                    <a href={`/can-i-run/${model.id}`} className="shrink-0 text-sm text-[var(--brand-ink)]" onClick={(event) => event.stopPropagation()}>Details</a>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {selected && (
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="m-0 text-[1.25rem] font-semibold">Set up {selected.model.name}</h3>
            {isPhone ? (
              <>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                  <li>Install <a className="text-[var(--brand-ink)]" href="https://github.com/a-ghorbani/pocketpal-ai">PocketPal AI</a>.</li>
                  <li>{selectedRepo ? <>Download <a className="text-[var(--brand-ink)]" href={`https://huggingface.co/${selectedRepo}`}>{selectedRepo}</a> as a Q4_K_M GGUF through its built-in Hugging Face browser, or import that file.</> : <>Download the Q4_K_M GGUF from the model’s listed source, then import it.</>}</li>
                  <li>Set context to <span className="font-mono tabular-nums">{contextK * 1000}</span> tokens in model settings before loading it.</li>
                  <li>Send one real prompt you use.</li>
                </ol>
                <p className="mt-3 text-sm text-muted-foreground">This is a memory estimate. Runtime compatibility on a phone is separate.</p>
                <p className="mt-3 text-sm text-muted-foreground"><a className="text-[var(--brand-ink)]" href="https://github.com/a-ghorbani/pocketpal-ai">PocketPal AI source</a> · <a className="text-[var(--brand-ink)]" href={`/tools#${platform}`}>Other local tools</a></p>
              </>
            ) : (
              <>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                  <li><a className="text-[var(--brand-ink)]" href="https://lmstudio.ai/download">Install and open LM Studio.</a></li>
                  <li>{selectedRepo ? <>Search for <a className="text-[var(--brand-ink)]" href={`https://huggingface.co/${selectedRepo}`}>{selectedRepo}</a>, then choose the Q4_K_M GGUF file.</> : <>Open the model details and use its listed GGUF source to choose the Q4_K_M file.</>}</li>
                  <li>In My Models, open the gear icon and set the context window to <span className="font-mono tabular-nums">{contextK * 1000}</span> tokens before loading it.</li>
                  <li>Open a chat and test one task you actually use.</li>
                </ol>
                <p className="mt-3 text-sm text-muted-foreground">
                  <a className="text-[var(--brand-ink)]" href="https://lmstudio.ai/docs/app/basics/download-model">LM Studio download guide</a> · <a className="text-[var(--brand-ink)]" href="https://lmstudio.ai/docs/app/advanced/per-model">Per-model settings</a> · <a className="text-[var(--brand-ink)]" href="https://lmstudio.ai/docs/app/basics/chat">LM Studio chat guide</a> · <a className="text-[var(--brand-ink)]" href="https://lmstudio.ai/docs/app/system-requirements">Check runtime system requirements</a> · <a className="text-[var(--brand-ink)]" href={`/tools#${platform}`}>Other local tools</a>
                </p>
              </>
            )}
            <a className="mt-4 block text-sm text-[var(--brand-ink)]" href={`/can-i-run/${selected.model.id}/${device.id}`}>Inspect this device estimate</a>
            <div className="mt-6 border-t border-border pt-5">
              <h3 className="m-0 text-[1.25rem] font-semibold">Did it work?</h3>
              <p className="mt-2 text-sm text-muted-foreground">Your voluntary response records one aggregate page view. It does not include your device or model choice.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a className="btn btn--primary" href="/start/result/worked" data-astro-prefetch="false">It worked</a>
                <a className="btn" href="/start/result/blocked" data-astro-prefetch="false">I got stuck</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
