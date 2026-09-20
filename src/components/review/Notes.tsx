"use client";

/**
 * Notes pinned to a recording (sprint S20, decision V3-0007).
 *
 * A note is anchored to something: an instant, a stretch brushed on the timeline, a
 * block, or the whole recording. What is anchored where is chosen by what the reader is
 * looking at when they write it, so the form follows the page's cursor rather than
 * asking for numbers.
 *
 * Only the author may edit or delete a note - the backend enforces it, and the UI shows
 * the controls only where they would work.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, ErrorBanner, cn } from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api";
import { formatClock } from "@/lib/builder/draft";
import type { RunBlock } from "@/lib/review/timeline";

import type { components } from "@/lib/api-types";

export type Annotation = components["schemas"]["AnnotationOut"];

export function Notes({
  recordingId,
  t,
  range,
  block,
  onSeek,
}: {
  recordingId: string;
  t: number;
  range: [number, number] | null;
  block: RunBlock | null;
  onSeek: (t: number) => void;
}) {
  const queryClient = useQueryClient();
  const key = ["annotations", recordingId];
  const notes = useQuery({
    queryKey: key,
    queryFn: () =>
      api.get<Annotation[]>(`recordings/${recordingId}/annotations`),
  });
  const [body, setBody] = useState("");
  const [anchor, setAnchor] = useState<Annotation["kind"]>("instant");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: () =>
      api.post(`recordings/${recordingId}/annotations`, {
        kind: anchor,
        body,
        ...(anchor === "instant" ? { t_start_s: t } : {}),
        ...(anchor === "range" && range
          ? { t_start_s: range[0], t_end_s: range[1] }
          : {}),
        ...(anchor === "block" && block ? { block_id: block.blockId } : {}),
      }),
    onSuccess: () => {
      setBody("");
      void refresh();
    },
  });

  const update = useMutation({
    mutationFn: (id: string) => api.patch(`annotations/${id}`, { body: draft }),
    onSuccess: () => {
      setEditing(null);
      void refresh();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`annotations/${id}`),
    onSuccess: refresh,
  });

  const anchors: { value: Annotation["kind"]; label: string; ok: boolean }[] = [
    { value: "instant", label: `At ${formatClock(t)}`, ok: true },
    {
      value: "range",
      label: range
        ? `${formatClock(range[0])}–${formatClock(range[1])}`
        : "A stretch (shift-drag first)",
      ok: range !== null,
    },
    {
      value: "block",
      label: block ? `Block: ${block.label}` : "A block (scrub to one)",
      ok: block !== null,
    },
    { value: "recording", label: "The whole recording", ok: true },
  ];

  return (
    <Card className="space-y-4">
      <h2 className="text-[15px] font-semibold">Notes</h2>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {anchors.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={!option.ok}
              onClick={() => setAnchor(option.value)}
              className={cn(
                "rounded-full px-3 py-1 text-[13px]",
                anchor === option.value
                  ? "bg-accent text-on-accent"
                  : "bg-surface-2 text-ink-2",
                !option.ok && "opacity-40"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="What did you notice?"
          aria-label="New note"
          className="w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-3 py-2"
        />
        <Button
          size="sm"
          disabled={!body.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          Add note
        </Button>
        {create.error instanceof ApiRequestError && (
          <ErrorBanner message={create.error.error.message} />
        )}
      </div>

      <ul className="space-y-2">
        {notes.data?.map((note) => (
          <li
            key={note.id}
            className="rounded-[var(--radius-control)] border border-hairline p-2"
          >
            <button
              type="button"
              className="type-caption text-accent"
              onClick={() => note.t_start_s !== null && onSeek(note.t_start_s)}
            >
              {note.kind === "recording"
                ? "Whole recording"
                : note.kind === "block"
                  ? `Block ${note.block_id}`
                  : note.kind === "range" && note.t_end_s !== null
                    ? `${formatClock(note.t_start_s ?? 0)}–${formatClock(note.t_end_s)}`
                    : formatClock(note.t_start_s ?? 0)}
            </button>
            {editing === note.id ? (
              <div className="mt-1 space-y-2">
                <textarea
                  value={draft}
                  rows={2}
                  onChange={(event) => setDraft(event.target.value)}
                  className="w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-2 py-1"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => update.mutate(note.id)}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-1 whitespace-pre-line text-[14px]">
                {note.body}
              </p>
            )}
            {note.mine && editing !== note.id && (
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  className="type-caption text-ink-3 hover:text-ink"
                  onClick={() => {
                    setEditing(note.id);
                    setDraft(note.body);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="type-caption text-ink-3 hover:text-danger"
                  onClick={() => remove.mutate(note.id)}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
        {notes.data?.length === 0 && (
          <li className="type-caption text-ink-3">
            No notes yet. Scrub to a moment and write what you see.
          </li>
        )}
      </ul>
    </Card>
  );
}
