"use client";

/**
 * The inspector of one selected block: its label, the timing every block shares, and
 * the kind's own config drawn from that kind's JSON Schema.
 *
 * Decision (sprint S19, task 1): the kind-specific half is generated from
 * `schemas/blocks.schema.json` by `SchemaForm`, so a new kind gets a form the day its
 * zod config schema is exported, with no inspector code to write.
 *
 * Contract: every `onChange` carries a **new** `BlockNode` (the builder compares by
 * identity for autosave and undo); nothing is saved or debounced here. A field whose
 * value comes from a loop column (`{$var}`) is shown read-only: its value belongs to
 * the condition table, and the group inspector is where that is edited.
 */

import { useTranslations } from "next-intl";
import { useState } from "react";
import { InfoTip } from "@/components/InfoTip";
import { KindCover } from "@/components/builder/KindCover";
import { Button, Field as FieldShell, Input } from "@/components/ui";
import { SchemaForm } from "@/components/builder/SchemaForm";
import type { JsonSchema } from "@/lib/builder/fields";
import { identityOf } from "@/lib/builder/kinds";
import type { BlockNode } from "@/lib/protocol/tree";

export interface BlockInspectorProps {
  block: BlockNode;
  /** Every kind's config schema, by kind name (`blocks.schema.json`'s `kinds`). */
  kindSchemas: Record<string, JsonSchema>;
  onChange: (next: BlockNode) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

/** The block's timing fields, in the order they happen around the block. */
const TIMING = ["pre_fixation_s", "jitter_s", "post_rest_s"] as const;
type TimingKey = (typeof TIMING)[number];

/** True for a value taken from a loop column instead of written on the block. */
function isVarRef(value: unknown): value is { $var: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { $var?: unknown }).$var === "string"
  );
}

export function BlockInspector({
  block,
  kindSchemas,
  onChange,
  onDelete,
  onDuplicate,
}: BlockInspectorProps) {
  const t = useTranslations("builder.inspector");
  const schema = kindSchemas[block.kind];
  const identity = identityOf(block.kind);
  // open when the block already uses one of them, so nothing set is ever out of sight
  const [around, setAround] = useState(
    () =>
      block.condition !== undefined ||
      block.skippable === true ||
      TIMING.some((key) => block[key] !== undefined)
  );

  /** Replace one optional property; an empty value drops it from the block. */
  const patch = (
    key: TimingKey | "skippable" | "condition",
    value: unknown
  ) => {
    const next: Record<string, unknown> = { ...block };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next as BlockNode);
  };

  return (
    <section className="space-y-5" aria-label={t("title")}>
      <header className="flex items-center gap-3">
        <span className="w-16 shrink-0">
          <KindCover kind={block.kind} />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">{identity.label}</p>
          {identity.hint && (
            <p className="type-caption text-ink-3">{identity.hint}</p>
          )}
        </div>
      </header>

      <FieldShell label={t("label")}>
        {isVarRef(block.label) ? (
          <Input
            readOnly
            value={t("from_column", { name: block.label.$var })}
          />
        ) : (
          <Input
            value={block.label}
            onChange={(event) =>
              onChange({ ...block, label: event.target.value })
            }
          />
        )}
      </FieldShell>

      <div className="space-y-4 border-t border-hairline pt-5">
        <h3 className="text-[13px] font-medium text-ink-2">{t("settings")}</h3>
        {schema ? (
          <SchemaForm
            schema={schema}
            kind={block.kind}
            value={block.config}
            onChange={(next) =>
              onChange({
                ...block,
                config: (next ?? {}) as Record<string, unknown>,
              })
            }
          />
        ) : (
          <FieldShell label={t("unknown_kind")} hint={t("unknown_kind_hint")}>
            <pre className="overflow-x-auto rounded-[var(--radius-control)] bg-surface-2 p-3 text-[13px] text-ink-2">
              {JSON.stringify(block.config, null, 2)}
            </pre>
          </FieldShell>
        )}
      </div>

      <div className="space-y-4 border-t border-hairline pt-5">
        <button
          type="button"
          aria-expanded={around}
          onClick={() => setAround((current) => !current)}
          className="text-[13px] font-medium text-ink-2 hover:text-ink"
        >
          {around ? "▾" : "▸"} {t("around")}
        </button>
        {around && (
          <div className="space-y-5">
            <FieldShell label={t("condition")} info={t("condition_hint")}>
              {isVarRef(block.condition) ? (
                <Input
                  readOnly
                  value={t("from_column", { name: block.condition.$var })}
                />
              ) : (
                <Input
                  value={block.condition ?? ""}
                  onChange={(event) =>
                    patch("condition", event.target.value || undefined)
                  }
                />
              )}
            </FieldShell>

            <div className="grid grid-cols-3 gap-3">
              {TIMING.map((key) => (
                <FieldShell key={key} label={t(key)} info={t(`${key}_hint`)}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.1}
                    value={block[key] ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (raw.trim() === "") patch(key, undefined);
                      else if (Number.isFinite(Number(raw)))
                        patch(key, Number(raw));
                    }}
                  />
                </FieldShell>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-[15px] text-ink">
                <input
                  type="checkbox"
                  checked={block.skippable === true}
                  onChange={(event) =>
                    patch("skippable", event.target.checked ? true : undefined)
                  }
                />
                <span>{t("skippable")}</span>
              </label>
              <InfoTip text={t("skippable_hint")} label={t("skippable")} />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-hairline pt-5">
        <Button variant="secondary" size="sm" onClick={onDuplicate}>
          {t("duplicate")}
        </Button>
        <Button variant="danger" size="sm" onClick={onDelete}>
          {t("delete")}
        </Button>
      </div>
    </section>
  );
}
