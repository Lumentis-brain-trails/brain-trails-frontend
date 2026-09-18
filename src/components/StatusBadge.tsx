import { cn } from "@/components/ui";

type Tone = "ok" | "busy" | "wait" | "bad" | "muted";

const TONE: Record<string, Tone> = {
  done: "ok",
  active: "ok",
  processing: "busy",
  running: "busy",
  approved: "busy",
  queued: "wait",
  uploaded: "wait",
  pending: "wait",
  failed: "bad",
  rejected: "bad",
};

const LABEL: Record<string, string> = {
  done: "Ready",
  processing: "Processing",
  running: "Running",
  queued: "Queued",
  uploaded: "Uploaded",
  failed: "Failed",
  pending: "Pending",
  approved: "Approved",
  active: "Active",
  rejected: "Rejected",
};

const DOT: Record<Tone, string> = {
  ok: "bg-ok",
  busy: "bg-accent",
  wait: "bg-warn",
  bad: "bg-danger",
  muted: "bg-ink-3",
};

/** Status as a dot + word. The dot pulses while something is in progress. */
export function StatusBadge({ status }: { status: string }) {
  const tone = TONE[status] ?? "muted";
  const live = tone === "busy";
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
      <span
        className={cn("relative h-2 w-2 rounded-full", DOT[tone])}
        data-motion="status"
      >
        {live && <span className="ping absolute inset-0 text-accent" />}
      </span>
      {LABEL[status] ?? status}
    </span>
  );
}
