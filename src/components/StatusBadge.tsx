import { cn } from "@/components/ui";

const STYLES: Record<string, string> = {
  done: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  queued: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  uploaded: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
        STYLES[status] ?? "bg-neutral-100 text-neutral-700"
      )}
    >
      {status}
    </span>
  );
}
