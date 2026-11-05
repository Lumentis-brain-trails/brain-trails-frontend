"use client";

/**
 * The roadmap editor: an item's form and a milestone's form, and the hook that sends
 * them. Shown only to people whose level grants `roadmap:write` (the API says so in
 * `editable`). Every save names the revision the page was drawn from; the answer is the
 * whole roadmap at its new revision, put straight into the page's cache.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useErrorText } from "@console/components/useErrorText";
import { OpsRequestError, ops } from "@console/lib/client";
import {
  type DraftError,
  type DraftErrors,
  type ItemDraft,
  type MilestoneDraft,
  checkItem,
  checkMilestone,
  freeId,
  itemOf,
  milestoneOf,
  slugOf,
} from "./lib/edit";
import { type Roadmap, STATUSES } from "./lib/gantt";

/** Codes whose server message names what to fix (which item, which track). */
const EXPLAINED = new Set([
  "invalid_roadmap",
  "depended_on",
  "validation_error",
]);

type Send =
  | { kind: "items" | "milestones"; method: "post"; body: unknown }
  | { kind: "items" | "milestones"; method: "put"; id: string; body: unknown }
  | { kind: "items" | "milestones"; method: "delete"; id: string };

/** Save, and what went wrong in words; a stale save reloads the chart underneath. */
export function useRoadmapWrite(revision: number) {
  const client = useQueryClient();
  const toast = useToast();
  const t = useTranslations("console.roadmap.edit");
  const errorText = useErrorText();
  const mutation = useMutation({
    mutationFn: (send: Send) => {
      const base = `roadmap/${send.kind}`;
      if (send.method === "post") return ops.post<Roadmap>(base, send.body);
      if (send.method === "put")
        return ops.put<Roadmap>(`${base}/${send.id}`, send.body);
      return ops.delete<Roadmap>(`${base}/${send.id}?revision=${revision}`);
    },
    onSuccess: (roadmap) => {
      client.setQueryData(["roadmap"], roadmap);
      toast("success", t("saved"));
    },
    onError: async (error) => {
      if (error instanceof OpsRequestError && error.code === "stale_roadmap")
        await client.invalidateQueries({ queryKey: ["roadmap"] });
    },
  });
  const error = mutation.error;
  const message = error
    ? error instanceof OpsRequestError && EXPLAINED.has(error.code)
      ? `${errorText(error)} ${error.message}`
      : errorText(error)
    : null;
  return { mutation, message };
}

function useFieldError() {
  const t = useTranslations("console.roadmap.edit.errors");
  return (e: DraftError | undefined) => (e ? t(e) : undefined);
}

function FormActions({
  busy,
  onCancel,
  onDelete,
}: {
  busy: boolean;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("console.roadmap.edit");
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <Button type="submit" disabled={busy}>
        {t("save")}
      </Button>
      <Button variant="secondary" onClick={onCancel} disabled={busy}>
        {t("cancel")}
      </Button>
      {onDelete && (
        <Button
          variant={confirming ? "danger" : "ghost"}
          className="ml-auto"
          disabled={busy}
          onClick={() => (confirming ? onDelete() : setConfirming(true))}
        >
          {confirming ? t("confirmDelete") : t("delete")}
        </Button>
      )}
    </div>
  );
}

/** An item's form: everything the bar and its detail show, its id only when new. */
export function ItemForm({
  roadmap,
  initial,
  isNew,
  onDone,
}: {
  roadmap: Roadmap;
  initial: ItemDraft;
  isNew: boolean;
  onDone: (id: string | null) => void;
}) {
  const t = useTranslations("console.roadmap.edit");
  const ts = useTranslations("console.roadmap.status");
  const fieldError = useFieldError();
  const [draft, setDraft] = useState<ItemDraft>(initial);
  const [idTouched, setIdTouched] = useState(false);
  const [errors, setErrors] = useState<DraftErrors<ItemDraft>>({});
  const { mutation, message } = useRoadmapWrite(roadmap.revision);
  const set = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const others = roadmap.items.filter((i) => i.id !== draft.id);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = checkItem(draft, roadmap, isNew);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const body = { revision: roadmap.revision, item: itemOf(draft) };
    mutation.mutate(
      isNew
        ? { kind: "items", method: "post", body }
        : { kind: "items", method: "put", id: initial.id, body },
      { onSuccess: () => onDone(draft.id) }
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={isNew ? t("newItem") : t("editItem")}
    >
      <h2 className="type-heading mb-4">
        {isNew ? t("newItem") : t("editItem")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-[1fr_3fr]">
        <Field label={t("label")} error={fieldError(errors.label)}>
          <Input
            value={draft.label}
            maxLength={20}
            onChange={(e) => {
              const label = e.target.value;
              setDraft((d) => ({
                ...d,
                label,
                id:
                  isNew && !idTouched
                    ? freeId(
                        slugOf(label),
                        roadmap.items.map((i) => i.id)
                      )
                    : d.id,
              }));
            }}
          />
        </Field>
        <Field label={t("name")} error={fieldError(errors.name)}>
          <Input
            value={draft.name}
            maxLength={200}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={t("start")} error={fieldError(errors.start)}>
          <Input
            type="date"
            value={draft.start}
            onChange={(e) => set("start", e.target.value)}
          />
        </Field>
        <Field label={t("end")} error={fieldError(errors.end)}>
          <Input
            type="date"
            value={draft.end}
            onChange={(e) => set("end", e.target.value)}
          />
        </Field>
        <Field label={t("track")} error={fieldError(errors.track)}>
          <Select
            value={draft.track}
            onChange={(e) => set("track", e.target.value)}
          >
            {roadmap.tracks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("status")}>
          <Select
            value={draft.status}
            onChange={(e) =>
              set("status", e.target.value as ItemDraft["status"])
            }
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("size")} hint={t("sizeHint")}>
          <Input
            value={draft.size}
            maxLength={60}
            onChange={(e) => set("size", e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 self-end pb-3 text-[14px] text-ink-2">
          <input
            type="checkbox"
            checked={draft.tentative}
            onChange={(e) => set("tentative", e.target.checked)}
          />
          {t("tentative")}
        </label>
      </div>
      {isNew && (
        <Field
          className="mt-4"
          label={t("id")}
          hint={t("idHint")}
          error={fieldError(errors.id)}
        >
          <Input
            value={draft.id}
            maxLength={40}
            onChange={(e) => {
              setIdTouched(true);
              set("id", e.target.value);
            }}
          />
        </Field>
      )}
      <Field className="mt-4" label={t("note")}>
        <Textarea
          value={draft.note}
          maxLength={2000}
          onChange={(e) => set("note", e.target.value)}
        />
      </Field>
      <fieldset className="mt-4">
        <legend className="mb-1.5 text-[13px] font-medium text-ink-2">
          {t("dependsOn")}
        </legend>
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-[var(--radius-control)] border border-hairline-strong p-2.5">
          {others.map((i) => (
            <label
              key={i.id}
              className="flex items-center gap-2 text-[13px] text-ink-2"
            >
              <input
                type="checkbox"
                checked={draft.depends_on.includes(i.id)}
                onChange={(e) =>
                  set(
                    "depends_on",
                    e.target.checked
                      ? [...draft.depends_on, i.id]
                      : draft.depends_on.filter((d) => d !== i.id)
                  )
                }
              />
              <span className="font-mono text-[12px] text-ink-3">
                {i.label}
              </span>
              {i.name}
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        className="mt-4"
        label={t("tasks")}
        hint={t("tasksHint")}
        error={fieldError(errors.tasks)}
      >
        <Textarea
          value={draft.tasks}
          onChange={(e) => set("tasks", e.target.value)}
        />
      </Field>
      <Field className="mt-4" label={t("questions")} hint={t("linesHint")}>
        <Textarea
          value={draft.questions}
          onChange={(e) => set("questions", e.target.value)}
        />
      </Field>
      <Field
        className="mt-4"
        label={t("links")}
        hint={t("linksHint")}
        error={fieldError(errors.links)}
      >
        <Textarea
          value={draft.links}
          onChange={(e) => set("links", e.target.value)}
        />
      </Field>
      {message && (
        <p role="alert" className="mt-4 text-[13px] text-danger">
          {message}
        </p>
      )}
      <FormActions
        busy={mutation.isPending}
        onCancel={() => onDone(isNew ? null : initial.id)}
        onDelete={
          isNew
            ? undefined
            : () =>
                mutation.mutate(
                  { kind: "items", method: "delete", id: initial.id },
                  { onSuccess: () => onDone(null) }
                )
        }
      />
    </form>
  );
}

/** A milestone's form, inline in the milestones card. */
export function MilestoneForm({
  roadmap,
  initial,
  isNew,
  onDone,
}: {
  roadmap: Roadmap;
  initial: MilestoneDraft;
  isNew: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("console.roadmap.edit");
  const ts = useTranslations("console.roadmap.status");
  const fieldError = useFieldError();
  const [draft, setDraft] = useState<MilestoneDraft>(initial);
  const [errors, setErrors] = useState<DraftErrors<MilestoneDraft>>({});
  const { mutation, message } = useRoadmapWrite(roadmap.revision);
  const set = <K extends keyof MilestoneDraft>(
    key: K,
    value: MilestoneDraft[K]
  ) => setDraft((d) => ({ ...d, [key]: value }));
  const taken = (roadmap.milestones ?? []).map((m) => m.id);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = checkMilestone(draft, roadmap, isNew);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const body = { revision: roadmap.revision, milestone: milestoneOf(draft) };
    mutation.mutate(
      isNew
        ? { kind: "milestones", method: "post", body }
        : { kind: "milestones", method: "put", id: initial.id, body },
      { onSuccess: onDone }
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={isNew ? t("newMilestone") : t("editMilestone")}
      className="rounded-[var(--radius-control)] border border-hairline p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          className="sm:col-span-2"
          label={t("milestoneName")}
          error={fieldError(errors.name)}
        >
          <Input
            value={draft.name}
            maxLength={200}
            onChange={(e) => {
              const name = e.target.value;
              setDraft((d) => ({
                ...d,
                name,
                id: isNew
                  ? freeId(`m-${slugOf(name)}`.slice(0, 40), taken)
                  : d.id,
              }));
            }}
          />
        </Field>
        <Field label={t("date")} error={fieldError(errors.date)}>
          <Input
            type="date"
            value={draft.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </Field>
        <Field label={t("status")}>
          <Select
            value={draft.status}
            onChange={(e) =>
              set("status", e.target.value as MilestoneDraft["status"])
            }
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          className="sm:col-span-2"
          label={t("track")}
          error={fieldError(errors.track)}
        >
          <Select
            value={draft.track}
            onChange={(e) => set("track", e.target.value)}
          >
            {roadmap.tracks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {errors.id && (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {fieldError(errors.id)}
        </p>
      )}
      {message && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {message}
        </p>
      )}
      <FormActions
        busy={mutation.isPending}
        onCancel={onDone}
        onDelete={
          isNew
            ? undefined
            : () =>
                mutation.mutate(
                  { kind: "milestones", method: "delete", id: initial.id },
                  { onSuccess: onDone }
                )
        }
      />
    </form>
  );
}
