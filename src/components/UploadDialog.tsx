"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { TASK_LABELS } from "@/lib/types";
import { Button, ErrorBanner, Field, Input } from "@/components/ui";

export function UploadDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [taskLabel, setTaskLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error("Choose a .csv or .edf file first.");
      if (!title.trim()) throw new Error("Give the recording a title.");
      if (file.size > 50 * 1024 * 1024) throw new Error("File exceeds 50 MB.");
      const form = new FormData();
      form.append("file", file);
      form.append("title", title.trim());
      if (taskLabel) form.append("task_label", taskLabel);
      const response = await fetch("/api/backend/recordings", {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? response.statusText);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <h2 className="mb-4 text-lg font-semibold">Upload a recording</h2>
        <div className="space-y-4">
          {error && <ErrorBanner message={error} />}
          <Field label="EEG file" hint="Mind Monitor .csv or .edf, up to 50 MB">
            <Input ref={fileRef} type="file" accept=".csv,.edf,.bdf" />
          </Field>
          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Morning meditation"
            />
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
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => upload.mutate()} disabled={upload.isPending}>
              {upload.isPending ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
