"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { uploadToStorage, type Presign } from "@/lib/upload";
import { TASK_LABELS } from "@/lib/types";
import { Button, ErrorBanner, Field, Input, Select, cn } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";

function formatSize(bytes: number) {
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/**
 * Upload sheet: drop zone, title, cleaning and task, then a real progress bar
 * (XHR to the presigned URL) followed by the registration call. The dialog
 * cannot be dismissed while the upload runs.
 */
export function UploadDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [taskLabel, setTaskLabel] = useState("");
  const [cleaner, setCleaner] = useState("classic");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a .csv or .edf file first.");
      if (!title.trim()) throw new Error("Give the recording a title.");
      const presign = await api.post<Presign>("recordings/uploads", {
        filename: file.name,
      });
      if (file.size > presign.max_mb * 1024 * 1024)
        throw new Error(`File exceeds ${presign.max_mb} MB.`);
      setProgress(0);
      await uploadToStorage(presign, file, setProgress);
      return api.post<{ recording_id: string }>("recordings/complete", {
        key: presign.key,
        title: title.trim(),
        task_label: taskLabel || null,
        cleaner,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
      toast("success", "Upload complete. Processing started.");
      onClose();
      router.push(`/recordings/${data.recording_id}`);
    },
    onError: (e: Error) => {
      setProgress(null);
      setError(e.message);
    },
  });

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setError(null);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replaceAll("_", " "));
  };

  return (
    <Sheet
      title="New recording"
      onClose={onClose}
      dismissible={!upload.isPending}
    >
      <div className="space-y-5">
        {error && <ErrorBanner message={error} />}

        <div
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={cn(
            "pressable flex cursor-pointer flex-col items-center rounded-[var(--radius-card)] border border-dashed px-6 py-8 text-center transition-colors",
            dragging
              ? "border-accent bg-accent-soft"
              : "border-hairline-strong bg-surface-2 hover:bg-surface-3"
          )}
        >
          <Input
            ref={fileRef}
            type="file"
            accept=".csv,.edf,.bdf"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
            tabIndex={-1}
          />
          {file ? (
            <>
              <p className="font-medium">{file.name}</p>
              <p className="type-caption mt-1 text-ink-3">
                {formatSize(file.size)} · click to change
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Drop a Muse file here</p>
              <p className="type-caption mt-1 text-ink-3">
                Mind Monitor .csv or .edf, up to 50 MB. Goes straight to
                storage.
              </p>
            </>
          )}
        </div>

        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Morning meditation"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cleaning">
            <Select
              value={cleaner}
              onChange={(e) => setCleaner(e.target.value)}
            >
              <option value="classic">Classic (filters + repair)</option>
              <option value="identity">None (raw standardized)</option>
            </Select>
          </Field>
          <Field label="Task">
            <Select
              value={taskLabel}
              onChange={(e) => setTaskLabel(e.target.value)}
            >
              <option value="">Not specified</option>
              {TASK_LABELS.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {progress !== null && (
          <div className="enter-fade" data-motion="status">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-(--m-fast)"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="type-caption mt-2 text-ink-3 tabular-nums">
              {progress < 100
                ? `Uploading ${progress}%`
                : "Registering the recording…"}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={upload.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => upload.mutate()}
            disabled={upload.isPending || !file}
          >
            {upload.isPending ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
