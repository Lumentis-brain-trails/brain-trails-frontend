"use client";

/**
 * The inspector of a selected group: a shuffled `sequence`, or a `loop` with its
 * condition table (backend decision V3-0004, "Groups in place of a loop editor").
 *
 * The everyday settings - how many repetitions, in what order, how long a run of the
 * same condition may get - sit at the top; the condition table is the expert corner and
 * lives under a collapsed "Advanced", because most groups never need one.
 *
 * Contract: `onChange` always receives a **new** node, never a mutation, and the table
 * keeps its invariant at every edit - every row has exactly one cell per column, which
 * is what `parseTree` checks before a protocol is saved. Cells are edited as text for
 * now; a media picker replaces the cell input where a column holds media ids.
 */

import { useTranslations } from "next-intl";
import { Button, Field as FieldShell, Input, Select } from "@/components/ui";
import type { Cell, LoopNode, SequenceNode } from "@/lib/protocol/tree";

/** What the builder calls a group: a sequence of blocks, or a loop over conditions. */
export type GroupNode = SequenceNode | LoopNode;

export interface GroupInspectorProps {
  node: GroupNode;
  onChange: (next: GroupNode) => void;
}

/** A loop orders its rows; a sequence orders its children. Both read as "order". */
const ORDERS: Record<GroupNode["type"], readonly string[]> = {
  loop: ["sequential", "random"],
  sequence: ["fixed", "shuffle"],
};

export function GroupInspector({ node, onChange }: GroupInspectorProps) {
  const t = useTranslations("builder.group");
  const loop = node.type === "loop" ? node : undefined;

  /** Replace one property; `undefined` drops an optional one. */
  const patch = (
    key: "order" | "repetitions" | "max_run_same",
    value: unknown
  ) => {
    const next: Record<string, unknown> = { ...node };
    if (value === undefined) delete next[key];
    else next[key] = value;
    // The copy keeps the node's discriminant and its children; only this key moved.
    onChange(next as unknown as GroupNode);
  };

  /** Replace the loop's condition table, keeping rows and columns in step. */
  const setConditions = (columns: string[], rows: Cell[][]) => {
    if (!loop) return;
    onChange({ ...loop, conditions: { columns, rows } });
  };

  return (
    <section className="space-y-5" aria-label={t("title")}>
      {loop && (
        <FieldShell label={t("repetitions")} hint={t("repetitions_hint")}>
          <Input
            type="number"
            min={1}
            step={1}
            value={loop.repetitions}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value >= 1)
                patch("repetitions", Math.floor(value));
            }}
          />
        </FieldShell>
      )}

      <FieldShell label={t("order")} hint={t("order_hint")}>
        <Select
          value={node.order}
          onChange={(event) => patch("order", event.target.value)}
        >
          {ORDERS[node.type].map((order) => (
            <option key={order} value={order}>
              {t(`order_${order}` as "order_fixed")}
            </option>
          ))}
        </Select>
      </FieldShell>

      <FieldShell label={t("max_run_same")} hint={t("max_run_same_hint")}>
        <Input
          type="number"
          min={1}
          step={1}
          value={node.max_run_same ?? ""}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw.trim() === "") patch("max_run_same", undefined);
            else if (Number.isFinite(Number(raw)) && Number(raw) >= 1)
              patch("max_run_same", Math.floor(Number(raw)));
          }}
        />
      </FieldShell>

      {loop && (
        <details className="rounded-[var(--radius-control)] border border-hairline p-3">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-2">
            {t("advanced")}
          </summary>
          <ConditionTable
            conditions={loop.conditions}
            onChange={setConditions}
          />
        </details>
      )}
    </section>
  );
}

/**
 * The loop's conditions: one column per `$var` a block reads, one row per condition.
 *
 * Adding a column appends an empty cell to every row and removing one drops that cell,
 * so the table is never saved ragged. A renamed column keeps its cells - the blocks
 * that read the old name are the author's to fix, and validation points at them.
 */
function ConditionTable({
  conditions,
  onChange,
}: {
  conditions: { columns: string[]; rows: Cell[][] };
  onChange: (columns: string[], rows: Cell[][]) => void;
}) {
  const t = useTranslations("builder.group");
  const { columns, rows } = conditions;

  const renameColumn = (index: number, name: string) =>
    onChange(
      columns.map((column, i) => (i === index ? name : column)),
      rows
    );

  const addColumn = () =>
    onChange(
      [...columns, `column_${columns.length + 1}`],
      rows.map((row) => [...row, ""])
    );

  const removeColumn = (index: number) =>
    onChange(
      columns.filter((_, i) => i !== index),
      rows.map((row) => row.filter((_, i) => i !== index))
    );

  const addRow = () => onChange(columns, [...rows, columns.map(() => "")]);

  const removeRow = (index: number) =>
    onChange(
      columns,
      rows.filter((_, i) => i !== index)
    );

  const setCell = (rowIndex: number, cellIndex: number, value: string) =>
    onChange(
      columns,
      rows.map((row, i) =>
        i === rowIndex
          ? row.map((cell, j) => (j === cellIndex ? value : cell))
          : row
      )
    );

  return (
    <div className="mt-3 space-y-3">
      <p className="type-caption text-ink-3">{t("conditions_hint")}</p>
      <table className="w-full table-fixed border-collapse text-[13px]">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index} className="p-1 text-left font-normal">
                <Input
                  aria-label={t("column_name", { index: index + 1 })}
                  value={column}
                  onChange={(event) => renameColumn(index, event.target.value)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("remove_column", { name: column })}
                  onClick={() => removeColumn(index)}
                >
                  {t("remove")}
                </Button>
              </th>
            ))}
            <th className="w-24 p-1 text-left font-normal">
              <Button variant="secondary" size="sm" onClick={addColumn}>
                {t("add_column")}
              </Button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column, cellIndex) => (
                <td key={cellIndex} className="p-1">
                  <Input
                    aria-label={t("cell", {
                      column,
                      row: rowIndex + 1,
                    })}
                    value={cellText(row[cellIndex])}
                    onChange={(event) =>
                      setCell(rowIndex, cellIndex, event.target.value)
                    }
                  />
                </td>
              ))}
              <td className="p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("remove_row", { index: rowIndex + 1 })}
                  onClick={() => removeRow(rowIndex)}
                >
                  {t("remove")}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="type-caption text-ink-3">{t("no_rows")}</p>
      )}
      <Button variant="secondary" size="sm" onClick={addRow}>
        {t("add_row")}
      </Button>
    </div>
  );
}

/** A cell as text: numbers and booleans keep their written form, `null` is empty. */
function cellText(cell: Cell | undefined): string {
  return cell === undefined || cell === null ? "" : String(cell);
}
