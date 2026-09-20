"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { uploadToStorage, type Presign } from "@/lib/upload";
import type { Media } from "@/lib/types";
import {
  Button,
  ErrorBanner,
  Field,
  Input,
  Textarea,
  cn,
} from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";

interface MediaPresign {
  max_mb: number;
  source: Presign;
  cover: Presign | null;
}

/** Lowercase words joined by dashes: the backend rejects anything else. */
const AUDIO_EXTENSION = /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Upload a video into the library: file, title, optional description, then the
 * presigned upload with a real progress bar and the catalog row.
 *
 * The file goes straight to storage (the BFF caps bodies at 4.5 MB); the duration is
 * read from the browser's own decoder so the card can show it without a server-side
 * probe. The sheet cannot be dismissed while the upload runs.
 */
export function MediaUploadDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kind: "video" | "audio" = file?.type.startsWith("audio/")
    ? "audio"
    : AUDIO_EXTENSION.test(file?.name ?? "")
      ? "audio"
      : "video";

  const readDuration = (f: File) =>
    new Promise<number | null>((resolve) => {
      const video = document.createElement(kind);
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve(Number.isFinite(video.duration) ? video.duration : null);
      };
      video.onerror = () => resolve(null);
      video.src = URL.createObjectURL(f);
    });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file first.");
      if (!title.trim()) throw new Error("Give it a title.");
      const presign = await api.post<MediaPresign>("media/uploads", {
        filename: file.name,
      });
      if (file.size > presign.max_mb * 1024 * 1024)
        throw new Error(`File exceeds ${presign.max_mb} MB.`);
      const duration = await readDuration(file);
      setProgress(0);
      await uploadToStorage(presign.source, file, setProgress);
      return api.post<Media>("media", {
        kind,
        title: title.trim(),
        slug: slugify(title) || slugify(file.name),
        description: description.trim() || null,
        source_key: presign.source.key,
        duration_s: duration,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      toast(
        "success",
        "Uploaded. It is checked in the background and appears when ready."
      );
      onClose();
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
      title="Upload a video or audio"
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
            id="media-file"
            type="file"
            accept="video/mp4,video/webm,video/quicktime,audio/*"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <span className="text-[15px] font-medium">
            {file ? file.name : "Drop an MP4, WebM or MOV here"}
          </span>
          <span className="type-caption mt-1 text-ink-3">
            {file
              ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
              : "or click to choose"}
          </span>
        </div>

        <Field label="Title">
          <Input
            id="media-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is it?"
          />
        </Field>

        <Field label="Description" hint="Optional.">
          <Textarea
            id="media-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Anything worth remembering about this clip."
          />
        </Field>

        {progress !== null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={upload.isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => upload.mutate()} disabled={upload.isPending}>
            {upload.isPending ? "Uploading…" : "Add to library"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
