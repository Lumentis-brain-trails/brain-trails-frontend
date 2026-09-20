"use client";

/**
 * The protocol builder (sprint S19, decision V3-0004 amendment).
 *
 * Three areas, like a simplified video editor: the bin on the left, the timeline in the
 * middle, the inspector on the right. What is saved is the tree of V3-0004 - the
 * timeline is only how it is shown - so every edit here is a pure function over that
 * tree (`lib/builder/draft.ts`) and the page owns three things only: what is selected,
 * the history, and the save.
 *
 * Saving is optimistic-concurrency: the draft carries a revision, every `PUT` names the
 * one it started from, and a 409 means someone else saved in between - the page then
 * stops autosaving and offers a reload rather than overwriting their work.
 *
 * Preview runs the real runner over `resolvePlan`, without a headband: what the
 * participant will see, in the browser, with no session and nothing stored.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlockInspector } from "@/components/builder/BlockInspector";
import { Bin } from "@/components/builder/Bin";
import { Monitor } from "@/components/builder/Monitor";
import { GroupInspector } from "@/components/builder/GroupInspector";
import { PublishDialog } from "@/components/builder/PublishDialog";
import { type DragPayload, Timeline } from "@/components/builder/Timeline";
import { ProtocolRunner } from "@/components/protocol/ProtocolRunner";
import "@/components/protocol/kinds";
import {
  Button,
  Card,
  ErrorBanner,
  Icon,
  Skeleton,
  buttonClass,
} from "@/components/ui";
import { ApiRequestError, api } from "@/lib/api";
import {
  ELEMENTS,
  type BinMedia,
  blockForElement,
  blockForMedia,
  clips as clipsOf,
  duplicateAt,
  groupClips,
  insertAt,
  moveClip,
  removeAt,
  replaceAt,
  ungroupAt,
} from "@/lib/builder/draft";
import { useHistory } from "@/lib/builder/history";
import { KIND_SCHEMAS } from "@/lib/builder/schemas";
import type { ProtocolDetail, ValidationResult } from "@/lib/protocol/catalog";
import { resolvePlan } from "@/lib/protocol/resolve";
import { createMemorySink } from "@/lib/protocol/sink";
import {
  parseTree,
  type ProtocolTree,
  type TreeNode,
} from "@/lib/protocol/tree";
import type { Media } from "@/lib/types";

const AUTOSAVE_MS = 1500;

const EMPTY_TREE: ProtocolTree = {
  schema: 1,
  manifest: {
    content_warning: null,
    requires_consent: false,
    consent_text: null,
    min_quality: 0.6,
  },
  root: { type: "sequence", order: "fixed", children: [] },
};

/** The clip a validation issue belongs to: its path starts `root/<index>`. */
function clipOfPath(path: string): number | null {
  const match = /^root\/(\d+)/.exec(path);
  return match ? Number(match[1]) : null;
}

export default function BuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("builder");
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ["protocol", id],
    queryFn: () => api.get<ProtocolDetail>(`protocols/${id}`),
  });

  const history = useHistory<ProtocolTree>(EMPTY_TREE);
  const [rev, setRev] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [zoom, setZoom] = useState(1);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [report, setReport] = useState<ValidationResult | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [preview, setPreview] = useState<ProtocolTree | null>(null);
  const loadedFor = useRef<string | null>(null);

  // The draft the server holds becomes the history's starting point, once per protocol.
  useEffect(() => {
    const data = detail.data;
    if (!data || loadedFor.current === data.id) return;
    loadedFor.current = data.id;
    const draft = data.draft ?? data.definition;
    const parsed = draft ? safeTree(draft) : EMPTY_TREE;
    history.reset(parsed);
    setRev(data.draft_rev ?? null);
  }, [detail.data, history]);

  const tree = history.present;
  const mediaById = useMediaIndex();
  const clips = useMemo(() => clipsOf(tree, mediaById), [mediaById, tree]);

  const save = useMutation({
    mutationFn: async (draft: ProtocolTree) => {
      if (rev === null) throw new Error("no revision");
      const out = await api.put<{ draft_rev: number }>(
        `protocols/${id}/draft`,
        { draft },
        { ifMatch: rev }
      );
      return out.draft_rev;
    },
    onMutate: () => setSaving("saving"),
    onSuccess: (next) => {
      setRev(next);
      setSaving("saved");
      void queryClient.invalidateQueries({ queryKey: ["protocols"] });
    },
    onError: (error) => {
      setSaving("idle");
      if (error instanceof ApiRequestError && error.status === 409)
        setConflict(true);
    },
  });

  // Autosave: one request per burst of edits, and none while a conflict is open.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (rev === null || conflict || loadedFor.current === null) return;
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      return; // the first tree is what the server already has
    }
    const timer = setTimeout(() => saveRef.current.mutate(tree), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [conflict, rev, tree]);

  const check = useMutation({
    mutationFn: () =>
      api.post<ValidationResult>(`protocols/${id}/validate`, {}),
    onSuccess: setReport,
  });

  const edit = useCallback(
    (next: (current: ProtocolTree) => ProtocolTree) => history.set(next),
    [history]
  );

  const onDropAt = useCallback(
    (index: number, payload: DragPayload) => {
      edit((current) => {
        if (payload.from === "timeline") {
          const from = Number(payload.value);
          return moveClip(current, from, from < index ? index - 1 : index);
        }
        if (payload.from === "bin-element") {
          const element = ELEMENTS.find((e) => e.kind === payload.value);
          return element
            ? insertAt(current, index, blockForElement(current, element))
            : current;
        }
        const item = mediaById[String(payload.value)];
        return item
          ? insertAt(current, index, blockForMedia(current, item))
          : current;
      });
      setSelected([index]);
    },
    [edit, mediaById]
  );

  const addMedia = useCallback(
    (item: Media) => {
      edit((current) =>
        insertAt(
          current,
          current.root.children.length,
          blockForMedia(current, item)
        )
      );
    },
    [edit]
  );

  const addElement = useCallback(
    (kind: string) => {
      const element = ELEMENTS.find((e) => e.kind === kind);
      if (!element) return;
      edit((current) =>
        insertAt(
          current,
          current.root.children.length,
          blockForElement(current, element)
        )
      );
    },
    [edit]
  );

  const removeSelected = useCallback(() => {
    edit((current) =>
      [...selected]
        .sort((a, b) => b - a)
        .reduce((acc, index) => removeAt(acc, index), current)
    );
    setSelected([]);
  }, [edit, selected]);

  const duplicateSelected = useCallback(() => {
    if (selected.length !== 1) return;
    edit((current) => duplicateAt(current, selected[0]));
  }, [edit, selected]);

  const group = useCallback(() => {
    if (selected.length < 2) return;
    let at = selected[0];
    edit((current) => {
      const result = groupClips(current, selected);
      at = result.index;
      return result.tree;
    });
    setSelected([at]);
  }, [edit, selected]);

  // Keyboard: the edits one repeats, one key away, but never while typing in a field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
      } else if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (mod && event.key.toLowerCase() === "g") {
        event.preventDefault();
        group();
      } else if (event.key === "Backspace" || event.key === "Delete") {
        if (selected.length === 0) return;
        event.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [duplicateSelected, group, history, removeSelected, selected.length]);

  const issues = useMemo(() => {
    const byClip: Record<number, { errors: number; warnings: number }> = {};
    const add = (path: string, key: "errors" | "warnings") => {
      const index = clipOfPath(path);
      if (index === null) return;
      byClip[index] ??= { errors: 0, warnings: 0 };
      byClip[index][key] += 1;
    };
    report?.errors.forEach((issue) => add(issue.path, "errors"));
    report?.warnings.forEach((issue) => add(issue.path, "warnings"));
    return byClip;
  }, [report]);

  if (detail.isPending)
    return (
      <main className="p-6">
        <Skeleton className="h-64 w-full" />
      </main>
    );
  if (detail.isError || !detail.data)
    return (
      <main className="mx-auto max-w-xl p-6">
        <ErrorBanner message={t("not_found")} />
        <Link href="/protocols" className={buttonClass("secondary")}>
          {t("back")}
        </Link>
      </main>
    );
  if (!detail.data.mine)
    return (
      <main className="mx-auto max-w-xl p-6">
        <ErrorBanner message={t("read_only")} />
        <Link href={`/protocols/${id}`} className={buttonClass("secondary")}>
          {t("back")}
        </Link>
      </main>
    );

  const covers = Object.fromEntries(
    Object.values(mediaById).map((item) => [item.id, item.cover_url])
  );
  const selectedNode: TreeNode | undefined =
    selected.length === 1 ? tree.root.children[selected[0]] : undefined;

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3">
        <Link
          href={`/protocols/${id}`}
          className="type-caption inline-flex items-center gap-1 font-medium text-accent"
        >
          <Icon name="back" className="h-3.5 w-3.5" /> {t("back")}
        </Link>
        <h1 className="type-subhead truncate">{detail.data.title}</h1>
        <span className="type-caption text-ink-3" role="status">
          {saving === "saving"
            ? t("saving")
            : saving === "saved"
              ? t("saved")
              : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={history.undo}
            disabled={!history.canUndo}
          >
            {t("undo")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={history.redo}
            disabled={!history.canRedo}
          >
            {t("redo")}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => check.mutate()}>
            {t("check")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPreview(tree)}
          >
            {t("preview")}
          </Button>
          <Button size="sm" onClick={() => setPublishing(true)}>
            {t("publish_action")}
          </Button>
        </div>
      </header>

      {conflict && (
        <div className="px-4 pt-3">
          <ErrorBanner message={t("conflict")} />
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={() => {
              loadedFor.current = null;
              setConflict(false);
              void detail.refetch();
            }}
          >
            {t("reload")}
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Bin onAdd={addMedia} onAddElement={addElement} />

        <section className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="mx-auto w-full max-w-[720px]">
            <Monitor
              clip={clips[selected[0] ?? 0]}
              media={mediaById}
              onPlay={() => setPreview(tree)}
            />
          </div>

          {report && (
            <Card className="space-y-2">
              <h2 className="text-[15px] font-semibold">{t("findings")}</h2>
              {report.errors.length === 0 && report.warnings.length === 0 && (
                <p className="type-caption text-ok">{t("all_good")}</p>
              )}
              <ul className="space-y-1 text-[14px]">
                {report.errors.map((issue, index) => (
                  <li key={`e${index}`} className="text-danger">
                    {issue.message}{" "}
                    <span className="text-ink-3">({issue.path})</span>
                  </li>
                ))}
                {report.warnings.map((issue, index) => (
                  <li key={`w${index}`} className="text-warn">
                    {issue.message}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <aside className="w-[320px] shrink-0 overflow-y-auto border-l border-hairline p-3">
          {!selectedNode && (
            <p className="type-caption text-ink-3">{t("select_a_clip")}</p>
          )}
          {selectedNode?.type === "block" && (
            <BlockInspector
              block={selectedNode}
              kindSchemas={KIND_SCHEMAS}
              onChange={(next) =>
                edit((current) => replaceAt(current, selected[0], next))
              }
              onDelete={removeSelected}
              onDuplicate={duplicateSelected}
            />
          )}
          {selectedNode && selectedNode.type !== "block" && (
            <GroupInspector
              node={selectedNode}
              onChange={(next) =>
                edit((current) => replaceAt(current, selected[0], next))
              }
            />
          )}
        </aside>
      </div>

      <section className="shrink-0 border-t border-hairline bg-surface px-4 pt-2 pb-3">
        <div className="mb-1 flex items-center gap-2">
          <label className="type-caption flex items-center gap-2 text-ink-3">
            {t("zoom")}
            <input
              type="range"
              min={0.4}
              max={3}
              step={0.2}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </label>
          {selected.length > 1 && (
            <Button size="sm" variant="secondary" onClick={group}>
              {t("group_action")}
            </Button>
          )}
          {selectedNode && selectedNode.type !== "block" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                edit((current) => ungroupAt(current, selected[0]));
                setSelected([]);
              }}
            >
              {t("ungroup")}
            </Button>
          )}
        </div>
        <Timeline
          clips={clips}
          selected={selected}
          zoom={zoom}
          issues={issues}
          onSelect={(index, additive) =>
            setSelected((current) =>
              additive
                ? current.includes(index)
                  ? current.filter((i) => i !== index)
                  : [...current, index]
                : [index]
            )
          }
          onDropAt={onDropAt}
          onOpenGroup={(index) => setSelected([index])}
          covers={covers}
        />
      </section>

      {publishing && (
        <PublishDialog
          protocol={detail.data}
          onClose={() => setPublishing(false)}
          onPublished={() => {
            setPublishing(false);
            void detail.refetch();
            void queryClient.invalidateQueries({ queryKey: ["protocols"] });
          }}
        />
      )}

      {preview && <Preview tree={preview} onClose={() => setPreview(null)} />}
    </main>
  );
}

/** A tree the server sent, parsed; an unreadable one starts the builder empty. */
function safeTree(draft: Record<string, unknown>): ProtocolTree {
  try {
    return parseTree(draft);
  } catch {
    return EMPTY_TREE;
  }
}

/** Media by id, for clip widths and for dropping from the bin. */
function useMediaIndex(): Record<string, BinMedia> {
  const list = useQuery({
    queryKey: ["media", "for-builder"],
    queryFn: () => api.get<Media[]>("media?limit=100"),
    staleTime: 60_000,
  });
  return useMemo(() => {
    const index: Record<string, BinMedia> = {};
    for (const item of list.data ?? [])
      index[item.id] = {
        id: item.id,
        kind: item.kind,
        title: item.title,
        duration_s: item.duration_s,
        cover_url: item.cover_url,
        preview_url: item.preview_url,
      };
    return index;
  }, [list.data]);
}

/**
 * The runner over the draft, with no headband and nothing stored: markers go to a
 * memory sink and are dropped when the preview closes.
 */
function Preview({
  tree,
  onClose,
}: {
  tree: ProtocolTree;
  onClose: () => void;
}) {
  const t = useTranslations("builder");
  const sink = useMemo(() => createMemorySink(), []);
  const plan = useMemo(() => {
    try {
      return resolvePlan(tree, 1, {
        id: "preview",
        version: 0,
        title: "Preview",
      });
    } catch {
      return null;
    }
  }, [tree]);

  if (!plan || plan.steps.length === 0)
    return (
      <div className="fixed inset-0 z-100 flex items-center justify-center bg-(--scrim) p-6">
        <Card className="max-w-sm space-y-3 text-center">
          <p className="text-ink-2">{t("preview_empty")}</p>
          <Button onClick={onClose}>{t("close")}</Button>
        </Card>
      </div>
    );

  return (
    <div className="fixed inset-0 z-100 bg-black">
      <ProtocolRunner
        protocol={plan}
        seed={1}
        sink={sink}
        warningShown
        onFinish={onClose}
        onExit={onClose}
      />
    </div>
  );
}
