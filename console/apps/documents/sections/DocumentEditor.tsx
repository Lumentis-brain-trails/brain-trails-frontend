"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  Button,
  ErrorBanner,
  Field,
  Input,
  Segmented,
  Select,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useErrorText } from "@console/components/useErrorText";
import {
  type DocumentIn,
  type DocumentKind,
  type DocumentOut,
  type DocumentUpdateIn,
  OpsRequestError,
  ops,
} from "@console/lib/client";
import {
  type DocumentDraft,
  type DraftError,
  KINDS,
  MAX_AUDIENCE,
  MAX_BODY,
  MAX_NOTE,
  MAX_SLUG,
  MAX_TITLE,
  checkDraft,
  slugify,
} from "../lib/documents";
import { Markdown } from "../Markdown";

/** Codes whose server message says what to fix (which field, which slug). */
const EXPLAINED = new Set(["validation_error"]);

function draftOf(doc: DocumentOut | undefined): DocumentDraft {
  return doc
    ? {
        slug: doc.slug,
        title: doc.title,
        kind: doc.kind,
        audience: doc.audience,
        body: doc.body,
        note: "",
      }
    : { slug: "", title: "", kind: "draft", audience: "", body: "", note: "" };
}

/**
 * The editor of a document, new (`doc` absent) or existing. A save names the revision
 * the editor was opened on; when someone saved since, bt-ops refuses it (409
 * `stale_document`) and the editor keeps every word typed here: the person reloads the
 * latest revision, which becomes the one the next save is made on, and sees its text
 * beside theirs to merge by hand.
 */
export function DocumentEditor({
  doc,
  onSaved,
  onCancel,
}: {
  doc?: DocumentOut;
  onSaved: (doc: DocumentOut) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("console.documents.editor");
  const tKind = useTranslations("console.documents.kind");
  const tError = useTranslations("console.documents.editor.errors");
  const errorText = useErrorText();
  const toast = useToast();
  const client = useQueryClient();
  const creating = doc === undefined;
  const [draft, setDraft] = useState<DocumentDraft>(() => draftOf(doc));
  const [base, setBase] = useState<number>(doc?.revision ?? 0);
  const [theirs, setTheirs] = useState<DocumentOut | null>(null);
  const [tried, setTried] = useState(false);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [slugTouched, setSlugTouched] = useState(false);

  const errors = checkDraft(draft, creating);
  const fieldError = (e: DraftError | undefined) =>
    tried && e ? tError(e) : undefined;
  const set = <K extends keyof DocumentDraft>(
    key: K,
    value: DocumentDraft[K]
  ) => setDraft((d) => ({ ...d, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      if (creating) {
        const body: DocumentIn = {
          title: draft.title.trim(),
          kind: draft.kind,
          audience: draft.audience.trim(),
          body: draft.body,
          note: draft.note.trim(),
        };
        if (draft.slug) body.slug = draft.slug;
        return ops.post<DocumentOut>("documents", body);
      }
      const body: DocumentUpdateIn = {
        revision: base,
        title: draft.title.trim(),
        body: draft.body,
        note: draft.note.trim(),
        kind: draft.kind,
        audience: draft.audience.trim(),
      };
      return ops.put<DocumentOut>(
        `documents/${encodeURIComponent(draft.slug)}`,
        body
      );
    },
    onSuccess: (saved) => {
      client.setQueryData(["documents", "doc", saved.slug], saved);
      void client.invalidateQueries({ queryKey: ["documents", "list"] });
      void client.invalidateQueries({
        queryKey: ["documents", "revisions", saved.slug],
      });
      toast("success", t("saved"));
      onSaved(saved);
    },
  });
  const stale =
    save.error instanceof OpsRequestError &&
    save.error.code === "stale_document";

  const reload = useMutation({
    mutationFn: () =>
      ops.get<DocumentOut>(`documents/${encodeURIComponent(draft.slug)}`),
    onSuccess: (latest) => {
      setTheirs(latest);
      setBase(latest.revision);
      save.reset();
      client.setQueryData(["documents", "doc", latest.slug], latest);
    },
  });

  const dirty =
    JSON.stringify({ ...draft, note: "" }) !==
    JSON.stringify({ ...draftOf(doc), note: "" });

  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length === 0) save.mutate();
  };

  const saveMessage =
    save.error && !stale
      ? save.error instanceof OpsRequestError && EXPLAINED.has(save.error.code)
        ? `${errorText(save.error)} ${save.error.message}`
        : errorText(save.error)
      : null;

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 className="type-heading">
        {creating ? t("newTitle") : t("editTitle", { revision: base })}
      </h2>

      {stale && (
        <div
          role="alert"
          className="grid gap-3 rounded-[var(--radius-control)] bg-warn-soft px-4 py-3 text-[14px]"
        >
          <p>{t("stale")}</p>
          <div>
            <Button
              size="sm"
              variant="secondary"
              disabled={reload.isPending}
              onClick={() => reload.mutate()}
            >
              {t("reload")}
            </Button>
          </div>
        </div>
      )}
      {reload.isError && <ErrorBanner message={errorText(reload.error)} />}
      {theirs && (
        <details
          open
          className="rounded-[var(--radius-control)] border border-hairline bg-surface-2 px-4 py-3 text-[14px]"
        >
          <summary className="cursor-pointer font-medium">
            {t("theirs", {
              revision: theirs.revision,
              who: theirs.updated_by ?? "-",
            })}
          </summary>
          <p className="mt-2 text-ink-2">{t("theirsHint")}</p>
          <p className="mt-2 font-medium">{theirs.title}</p>
          <Textarea
            readOnly
            value={theirs.body}
            aria-label={t("theirsBody")}
            className="mt-2 min-h-40 font-mono text-[13px]"
          />
        </details>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("title")} error={fieldError(errors.title)}>
          <Input
            value={draft.title}
            maxLength={MAX_TITLE + 20}
            onChange={(e) => {
              const title = e.target.value;
              setDraft((d) => ({
                ...d,
                title,
                slug: creating && !slugTouched ? slugify(title) : d.slug,
              }));
            }}
          />
        </Field>
        {creating ? (
          <Field
            label={t("slug")}
            hint={t("slugHint")}
            error={fieldError(errors.slug)}
          >
            <Input
              value={draft.slug}
              maxLength={MAX_SLUG}
              className="font-mono"
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value);
              }}
            />
          </Field>
        ) : (
          <Field label={t("slug")}>
            <Input value={draft.slug} disabled className="font-mono" />
          </Field>
        )}
        <Field label={t("kind")}>
          <Select
            value={draft.kind}
            onChange={(e) => set("kind", e.target.value as DocumentKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {tKind(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t("audience")}
          hint={t("audienceHint")}
          error={fieldError(errors.audience)}
        >
          <Input
            value={draft.audience}
            maxLength={MAX_AUDIENCE + 20}
            onChange={(e) => set("audience", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label={t("mode")}
            value={tab}
            onChange={setTab}
            options={[
              { value: "write", label: t("write") },
              { value: "preview", label: t("preview") },
            ]}
          />
          <span className="text-[12px] text-ink-3">
            {t("length", { n: draft.body.length, max: MAX_BODY })}
          </span>
        </div>
        {tab === "write" ? (
          <Textarea
            value={draft.body}
            aria-label={t("bodyLabel")}
            onChange={(e) => set("body", e.target.value)}
            className="min-h-[28rem] font-mono text-[13px] leading-6"
          />
        ) : (
          <div className="min-h-[28rem] rounded-[var(--radius-control)] border border-hairline px-5 py-3">
            {draft.body.trim() ? (
              <Markdown text={draft.body} />
            ) : (
              <p className="text-ink-3">{t("nothingToPreview")}</p>
            )}
          </div>
        )}
        {fieldError(errors.body) && (
          <p role="alert" className="text-[13px] text-danger">
            {fieldError(errors.body)}
          </p>
        )}
        <p className="text-[12px] text-ink-3">{t("privacy")}</p>
      </div>

      <Field
        label={t("note")}
        hint={t("noteHint")}
        error={fieldError(errors.note)}
      >
        <Input
          value={draft.note}
          maxLength={MAX_NOTE + 20}
          onChange={(e) => set("note", e.target.value)}
        />
      </Field>

      {saveMessage && <ErrorBanner message={saveMessage} />}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.isPending || stale}>
          {save.isPending ? t("saving") : t("save")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (!dirty || window.confirm(t("discard"))) onCancel();
          }}
        >
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
