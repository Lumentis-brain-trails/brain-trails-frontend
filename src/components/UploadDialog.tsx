"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { TASK_LABELS } from "@/lib/types";
import { Button, ErrorBanner, Field, Input } from "@/components/ui";
import { useToast } from "@/components/Toast";

interface Presign {
  key: string;
  url: string;
  fields: Record<string, string>;
  max_mb: number;
}

function uploadToStorage(
  presign: Presign,
  file: File,
  onProgress: (pct: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    Object.entries(presign.fields).forEach(([k, v]) => form.append(k, v));
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status < 300
        ? resolve()
        : reject(new Error(`storage upload failed (${xhr.status})`));
    xhr.onerror = () =>
      reject(new Error("network error while uploading to storage"));
    xhr.open("POST", presign.url);
    xhr.send(form);
  });
}

export function UploadDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [taskLabel, setTaskLabel] = useState("");
  const [cleaner, setCleaner] = useState("classic");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
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
      toast("success", "Upload complete - processing started.");
      onClose();
      router.push(`/recordings/${data.recording_id}`);
    },
    onError: (e: Error) => {
      setProgress(null);
      setError(e.message);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <h2 className="mb-4 text-lg font-semibold">Upload a recording</h2>
        <div className="space-y-4">
          {error && <ErrorBanner message={error} />}
          <Field
            label="EEG file"
            hint="Mind Monitor .csv or .edf - uploads go straight to storage, up to 50 MB"
          >
            <Input ref={fileRef} type="file" accept=".csv,.edf,.bdf" />
          </Field>
          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Morning meditation"
            />
          </Field>
          <Field label="Cleaning">
            <select
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              value={cleaner}
              onChange={(e) => setCleaner(e.target.value)}
            >
              <option value="classic">
                classic (filters + artifact repair)
              </option>
              <option value="identity">none (raw standardized signal)</option>
            </select>
          </Field>
          <Field label="Task (optional)">
            <select
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              value={taskLabel}
              onChange={(e) => setTaskLabel(e.target.value)}
            >
              <option value="">none</option>
              {TASK_LABELS.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </Field>
          {progress !== null && (
            <div>
              <div className="h-2 w-full overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700">
                <div
                  className="h-full bg-indigo-600 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {progress < 100
                  ? `Uploading... ${progress}%`
                  : "Registering the recording..."}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={upload.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => upload.mutate()} disabled={upload.isPending}>
              {upload.isPending ? "Working..." : "Upload"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
