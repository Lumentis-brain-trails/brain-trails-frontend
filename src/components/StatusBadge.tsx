import { useTranslations } from "next-intl";
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
  capturing: "wait",
  empty: "muted",
  pending: "wait",
  failed: "bad",
  rejected: "bad",
};

/**
 * Account statuses, which only the staff app shows: it stays English by decision, so
 * these are not in the catalogue. Recording and job statuses are (`recordings.status`).
 */
const STAFF_LABEL: Record<string, string> = {
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

/**
 * Status as a dot + word. The dot pulses while something is in progress.
 *
 * The word is the catalogue's for a recording or job status, English for an account
 * status, and the raw status for one this component has never heard of.
 */
export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("recordings.status");
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
      {t.has(status as never)
        ? t(status as never)
        : (STAFF_LABEL[status] ?? status)}
    </span>
  );
}
