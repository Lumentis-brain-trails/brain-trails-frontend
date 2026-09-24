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
 * A protocol starts here, not in the catalog: `/protocols/new/edit` opens an unsaved
 * builder and the row is created by the first autosave, once something is on the
 * timeline. Opening the builder and walking away leaves nothing behind.
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
  splitAt,
  ungroupAt,
} from "@/lib/builder/draft";
import { useHistory } from "@/lib/builder/history";
import { KIND_SCHEMAS } from "@/lib/builder/schemas";
import type { ProtocolDetail, ValidationResult } from "@/lib/protocol/catalog";
import { bindMedia, mediaIds } from "@/lib/protocol/media";
import { usePreviewMedia } from "@/lib/protocol/previewMedia";
import { resolvePlan } from "@/lib/protocol/resolve";
import { SoundInspector } from "@/components/builder/SoundInspector";
import { SoundLane } from "@/components/builder/SoundLane";
import {
  addCue,
  moveCueStart,
  nextCueId,
  removeCue,
  setCueStop,
  updateCue,
} from "@/lib/builder/soundtrack";
import { TREE_SCHEMA_VERSION } from "@/lib/protocol/tree";
import { createMemorySink } from "@/lib/protocol/sink";
import {
  parseTree,
  type ProtocolTree,
  type TreeNode,
} from "@/lib/protocol/tree";
import type { Media } from "@/lib/types";
import { inWorkspace, useCurrentWorkspace } from "@/lib/workspace";

const AUTOSAVE_MS = 1500;

/** The id `/protocols/[id]/edit` carries while the protocol has never been saved. */
const UNSAVED = "new";

const EMPTY_TREE: ProtocolTree = {
  schema: TREE_SCHEMA_VERSION,
  manifest: {
    content_warning: null,
    requires_consent: false,
    consent_text: null,
    min_quality: 0.6,
  },
  root: { type: "sequence", order: "fixed", children: [] },
  soundtrack: [],
};

/** Every block under a node, with the label a person would recognise it by. */
function blocksIn(node: TreeNode): { id: string; label: string }[] {
  if (node.type === "block")
    return [
      {
        id: node.id,
        label:
          typeof node.label === "string" && node.label ? node.label : node.id,
      },
    ];
  if (node.type === "sequence") return node.children.flatMap(blocksIn);
  return blocksIn(node.template);
}

/** The clip a validation issue belongs to: its path starts `root/<index>`. */
function clipOfPath(path: string): number | null {
  const match = /^root\/(\d+)/.exec(path);
  return match ? Number(match[1]) : null;
}

/**
 * Whether a draft is worth a row of its own: something has been put on the timeline.
 *
 * An empty builder is not a protocol. Until this holds, nothing is sent to the server,
 * so opening the builder and changing one's mind leaves no draft behind.
 */
function hasContent(tree: ProtocolTree): boolean {
  return tree.root.children.length > 0;
}

export default function BuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("builder");
  const queryClient = useQueryClient();
  const workspace = useCurrentWorkspace();

  // The id the server knows, or null while the protocol exists only in this page.
  const [savedId, setSavedId] = useState<string | null>(
    id === UNSAVED ? null : id
  );
  const unsaved = savedId === null;

  const detail = useQuery({
    queryKey: ["protocol", savedId],
    queryFn: () => api.get<ProtocolDetail>(`protocols/${savedId}`),
    enabled: savedId !== null,
  });

  const history = useHistory<ProtocolTree>(EMPTY_TREE);
  const [rev, setRev] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  /** The sound selected on the lane; a block and a sound are never selected together. */
  const [selectedCue, setSelectedCue] = useState<string | null>(null);
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

  // What the last request carried, so a save is never repeated for an unchanged tree.
  const sentRef = useRef<ProtocolTree | null>(null);

  const save = useMutation({
    mutationFn: async (draft: ProtocolTree) => {
      if (rev === null) throw new Error("no revision");
      const out = await api.put<{ draft_rev: number }>(
        `protocols/${savedId}/draft`,
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
      sentRef.current = null; // a failed save is retried by the next edit
      if (error instanceof ApiRequestError && error.status === 409)
        setConflict(true);
    },
  });

  // The first save of a protocol that has never been saved: it is born here.
  const create = useMutation({
    mutationFn: (draft: ProtocolTree) =>
      api.post<ProtocolDetail>(inWorkspace("protocols", workspace), {
        title: t("untitled"),
        draft,
      }),
    onMutate: () => setSaving("saving"),
    onSuccess: (protocol) => {
      // The tree in hand is the one just saved: nothing to load from the server.
      loadedFor.current = protocol.id;
      queryClient.setQueryData(["protocol", protocol.id], protocol);
      setSavedId(protocol.id);
      setRev(protocol.draft_rev ?? 1);
      setSaving("saved");
      // The URL follows the protocol without remounting the builder: reloading the
      // page, or sharing the link, opens the draft that now exists.
      window.history.replaceState(null, "", `/protocols/${protocol.id}/edit`);
      void queryClient.invalidateQueries({ queryKey: ["protocols"] });
    },
    onError: () => {
      setSaving("idle");
      sentRef.current = null;
    },
  });

  // Autosave: one request per burst of edits, and none while a conflict is open. An
  // unsaved protocol waits for content: an empty timeline is nothing to keep.
  const saveRef = useRef(save);
  const createRef = useRef(create);
  useEffect(() => {
    saveRef.current = save;
    createRef.current = create;
  });
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (conflict) return;
    if (!unsaved && (rev === null || loadedFor.current === null)) return;
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      return; // the first tree is what the server already has, or nothing at all
    }
    const timer = setTimeout(() => {
      if (sentRef.current === tree) return;
      if (unsaved) {
        if (!hasContent(tree)) return;
        sentRef.current = tree;
        createRef.current.mutate(tree);
        return;
      }
      sentRef.current = tree;
      saveRef.current.mutate(tree);
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [conflict, rev, tree, unsaved]);

  const check = useMutation({
    mutationFn: () =>
      api.post<ValidationResult>(`protocols/${savedId}/validate`, {}),
    onSuccess: setReport,
  });

  const edit = useCallback(
    (next: (current: ProtocolTree) => ProtocolTree) => history.set(next),
    [history]
  );

  const onDropAt = useCallback(
    (index: number, payload: DragPayload) => {
      // A sound's bar or its stop handle was let go over the clips: it belongs to the
      // lane, and moving it is the lane's job, not a new block's.
      if (payload.from === "lane-cue" || payload.from === "lane-stop") return;
      edit((current) => {
        if (payload.from === "timeline") {
          const from = Number(payload.value);
          return moveClip(current, from, from < index ? index - 1 : index);
        }
        if (payload.from === "bin-element") {
          const element = ELEMENTS.find((e) => e.id === payload.value);
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
      const element = ELEMENTS.find((e) => e.id === kind);
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

  if (!unsaved && detail.isPending)
    return (
      <main className="p-6">
        <Skeleton className="h-64 w-full" />
      </main>
    );
  if (!unsaved && (detail.isError || !detail.data))
    return (
      <main className="mx-auto max-w-xl p-6">
        <ErrorBanner message={t("not_found")} />
        <Link href="/protocols" className={buttonClass("secondary")}>
          {t("back")}
        </Link>
      </main>
    );
  if (detail.data && !detail.data.mine)
    return (
      <main className="mx-auto max-w-xl p-6">
        <ErrorBanner message={t("read_only")} />
        <Link
          href={`/protocols/${savedId}`}
          className={buttonClass("secondary")}
        >
          {t("back")}
        </Link>
      </main>
    );

  const covers = Object.fromEntries(
    Object.values(mediaById).map((item) => [item.id, item.cover_url])
  );
  const selectedNode: TreeNode | undefined =
    selected.length === 1 ? tree.root.children[selected[0]] : undefined;
  const selectedSound = selectedCue
    ? (tree.soundtrack ?? []).find((cue) => cue.id === selectedCue)
    : undefined;
  const blockChoices = tree.root.children.flatMap(blocksIn);

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3">
        <Link
          href={unsaved ? "/protocols" : `/protocols/${savedId}`}
          className="type-caption inline-flex items-center gap-1 font-medium text-accent"
        >
          <Icon name="back" className="h-3.5 w-3.5" /> {t("back")}
        </Link>
        <h1 className="type-subhead truncate">
          {detail.data?.title ?? t("untitled")}
        </h1>
        <span className="type-caption text-ink-3" role="status">
          {saving === "saving"
            ? t("saving")
            : saving === "saved"
              ? t("saved")
              : unsaved
                ? t("not_saved_yet")
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
          <Button
            size="sm"
            variant="secondary"
            onClick={() => check.mutate()}
            disabled={unsaved}
          >
            {t("check")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPreview(tree)}
          >
            {t("preview")}
          </Button>
          <Button
            size="sm"
            onClick={() => setPublishing(true)}
            disabled={unsaved}
          >
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
              onSplit={(atS) =>
                edit((current) =>
                  splitAt(current, selected[0] ?? 0, atS, mediaById)
                )
              }
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
          {selectedSound && (
            <SoundInspector
              key={selectedSound.id}
              cue={selectedSound}
              blocks={blockChoices}
              media={mediaById[selectedSound.media_id]}
              onChange={(patch) =>
                edit((current) => updateCue(current, selectedSound.id, patch))
              }
              onStop={(where) =>
                edit((current) =>
                  where.startsWith("block:")
                    ? updateCue(current, selectedSound.id, {
                        stop: { block: where.slice("block:".length) },
                      })
                    : setCueStop(
                        current,
                        clipsOf(current, mediaById),
                        selectedSound.id,
                        where as "clip_end" | "protocol_end"
                      )
                )
              }
              onDelete={() => {
                edit((current) => removeCue(current, selectedSound.id));
                setSelectedCue(null);
              }}
            />
          )}
          {!selectedNode && !selectedSound && (
            <p className="type-caption text-ink-3">{t("select_a_clip")}</p>
          )}
          {selectedNode?.type === "block" && (
            <BlockInspector
              // a fresh inspector per block: what was unfolded for one stays with it
              key={selectedNode.id}
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
          lane={
            <SoundLane
              clips={clips}
              zoom={zoom}
              soundtrack={tree.soundtrack ?? []}
              media={mediaById}
              selected={selectedCue}
              onSelect={(id) => {
                setSelected([]);
                setSelectedCue(id);
              }}
              onAdd={(mediaId, clipIndex) => {
                // `edit` applies on the next render, so the new sound's id is worked out
                // from the tree as it stands - the same rule `addCue` uses.
                const id = nextCueId(tree.soundtrack ?? []);
                edit(
                  (current) =>
                    addCue(
                      current,
                      clipsOf(current, mediaById),
                      mediaId,
                      clipIndex
                    ).tree
                );
                setSelected([]);
                setSelectedCue(id);
              }}
              onMoveStart={(id, clipIndex) =>
                edit((current) =>
                  moveCueStart(
                    current,
                    clipsOf(current, mediaById),
                    id,
                    clipIndex
                  )
                )
              }
              onSetStop={(id, clipIndex) =>
                edit((current) =>
                  setCueStop(
                    current,
                    clipsOf(current, mediaById),
                    id,
                    clipIndex
                  )
                )
              }
            />
          }
          onSelect={(index, additive) => {
            setSelectedCue(null);
            setSelected((current) =>
              additive
                ? current.includes(index)
                  ? current.filter((i) => i !== index)
                  : [...current, index]
                : [index]
            );
          }}
          onDropAt={onDropAt}
          onOpenGroup={(index) => setSelected([index])}
          covers={covers}
        />
      </section>

      {publishing && detail.data && (
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
 *
 * Media are bound exactly as a real run binds them, from a map built by
 * `usePreviewMedia` instead of the session start. Without that step a video reached the
 * runner with an id and no file, and the preview fell over at the first video block.
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
  const ids = useMemo(() => (plan ? mediaIds(plan) : []), [plan]);
  const { media, missing } = usePreviewMedia(ids);
  const bound = useMemo(() => {
    if (!plan || !media) return null;
    try {
      return { plan: bindMedia(plan, media), error: null };
    } catch (e) {
      return { plan: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [plan, media]);

  const notice = (message: string) => (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-(--scrim) p-6">
      <Card className="max-w-sm space-y-3 text-center">
        <p className="text-ink-2">{message}</p>
        <Button onClick={onClose}>{t("close")}</Button>
      </Card>
    </div>
  );

  if (!plan || plan.steps.length === 0) return notice(t("preview_empty"));
  if (missing)
    return notice(
      "One of the media in this protocol could not be loaded - it may have been deleted. Replace it and try again."
    );
  if (!bound)
    return (
      <div className="fixed inset-0 z-100 flex items-center justify-center bg-black text-white/70">
        Loading the media…
      </div>
    );
  if (!bound.plan)
    return notice(bound.error ?? "This protocol cannot be previewed.");

  return (
    <div className="fixed inset-0 z-100 bg-black">
      <ProtocolRunner
        protocol={bound.plan}
        seed={1}
        sink={sink}
        warningShown
        onFinish={onClose}
        onExit={onClose}
      />
    </div>
  );
}
