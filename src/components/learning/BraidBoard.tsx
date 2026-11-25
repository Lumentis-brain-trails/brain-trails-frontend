"use client";

/**
 * The braided path, drawn: strands that cross and tangle between a start and an end,
 * each as thick as its synapse, with the pointer's node lit, the edges it can take next
 * in their vote colours, and a fog over everything more than a couple of hops away.
 *
 * `BraidBoard` is the picture alone, for the teacher's screen of the live class game
 * (the class game page drives it) and for `BraidLab`, the solo version on the module's
 * page, where a click on a coloured edge is the vote.
 */
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button, Card, cn } from "@/components/ui";
import {
  type Braid,
  type BraidState,
  CAP,
  FOG,
  arrived,
  byThickness,
  choicesAt,
  endRound,
  makeBraid,
  move,
  startState,
  visibleNodes,
} from "@/lib/learning/braid";

/** The colours of the choices at a node, in `choicesAt` order: the phones' buttons. */
export const CHOICE_COLOURS = [
  "#3b82f6",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#a3a329",
];

/** The colour of each edge the class may take now, by edge id. */
export function choiceColours(
  braid: Braid,
  state: BraidState
): Record<string, string> {
  return Object.fromEntries(
    choicesAt(braid, state).map((e, i) => [
      e.id,
      CHOICE_COLOURS[i % CHOICE_COLOURS.length],
    ])
  );
}

export function BraidBoard({
  braid,
  state,
  fog = FOG,
  votes,
  onPick,
  className,
}: {
  braid: Braid;
  state: BraidState;
  /** Hops visible around the pointer; `Infinity` lifts the fog. */
  fog?: number;
  /** Votes per edge, drawn as a number beside each choice. */
  votes?: Record<string, number>;
  onPick?: (edgeId: string) => void;
  className?: string;
}) {
  const visible = visibleNodes(braid, state, fog);
  const colours = choiceColours(braid, state);
  const at = braid.nodes[state.at];
  const pathOf = (id: string) => {
    const e = braid.edges.find((x) => x.id === id);
    if (!e) return "";
    const a = braid.nodes[e.from];
    const b = braid.nodes[e.to];
    return `M${a.x},${a.y} C${e.c1[0]},${e.c1[1]} ${e.c2[0]},${e.c2[1]} ${b.x},${b.y}`;
  };
  return (
    <svg
      viewBox={`0 0 ${braid.width} ${braid.height}`}
      className={cn("w-full text-ink", className)}
      role="img"
    >
      <g fill="none" strokeLinecap="round">
        {braid.edges.map((e) => {
          if (!visible.has(e.from) || !visible.has(e.to)) return null;
          const w = state.weights[e.id] ?? 1;
          const choice = colours[e.id];
          return (
            <path
              key={e.id}
              d={pathOf(e.id)}
              stroke={choice ?? "currentColor"}
              strokeWidth={0.25 + w * 0.35}
              opacity={choice ? 0.95 : 0.15 + (w / CAP) * 0.5}
              className={cn(choice && onPick && "cursor-pointer")}
              onClick={choice && onPick ? () => onPick(e.id) : undefined}
            />
          );
        })}
      </g>
      {braid.nodes.map((n) => {
        if (!visible.has(n.id)) return null;
        const here = n.id === state.at;
        return (
          <circle
            key={n.id}
            cx={n.x}
            cy={n.y}
            r={n.kind === "start" || n.kind === "end" ? 2 : here ? 1.8 : 1.1}
            fill={
              here
                ? "var(--accent)"
                : n.kind === "end"
                  ? "#10b981"
                  : n.kind === "dead"
                    ? "var(--surface-3)"
                    : "var(--surface)"
            }
            stroke="currentColor"
            strokeWidth={0.3}
          />
        );
      })}
      {Object.entries(colours).map(([id, colour]) => {
        const e = braid.edges.find((x) => x.id === id);
        if (!e) return null;
        const b = braid.nodes[e.to];
        return (
          <g
            key={id}
            onClick={onPick ? () => onPick(id) : undefined}
            className={cn(onPick && "cursor-pointer")}
          >
            <circle cx={b.x} cy={b.y} r={2.4} fill={colour} opacity={0.9} />
            {votes && (
              <text
                x={b.x}
                y={b.y + 1.1}
                fontSize={3}
                textAnchor="middle"
                fill="white"
                fontWeight={700}
              >
                {votes[id] ?? 0}
              </text>
            )}
          </g>
        );
      })}
      <circle
        cx={at.x}
        cy={at.y}
        r={3.2}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={0.5}
      />
    </svg>
  );
}

/**
 * The braided path for one player: click a coloured edge to go there. Each crossing
 * thickens the edge; at the end a new round starts and unused edges thin. "Let the habit
 * choose" moves along an edge picked in proportion to thickness, like a tie in class.
 */
export function BraidLab() {
  const t = useTranslations("learning.labs.braid");
  const braid = useMemo(() => makeBraid(4), []);
  const [state, setState] = useState<BraidState>(() => startState(braid));
  const [fog, setFog] = useState(true);
  const done = arrived(braid, state);
  const pick = (edgeId: string) => setState((s) => move(braid, s, edgeId));
  const habit = () => {
    const choices = choicesAt(braid, state).map((e) => e.id);
    if (choices.length) pick(byThickness(choices, state.weights));
  };
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="type-subhead">{t("title")}</h3>
        <p className="mt-1 text-ink-2">{t("text")}</p>
      </div>
      <div className="rounded-xl border border-hairline bg-surface p-2">
        <BraidBoard
          braid={braid}
          state={state}
          fog={fog ? FOG : Infinity}
          onPick={done ? undefined : pick}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {done ? (
          <Button size="sm" onClick={() => setState((s) => endRound(s))}>
            {t("next")}
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={habit}>
            {t("habit")}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setFog((f) => !f)}>
          {fog ? t("liftFog") : t("fog")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setState(startState(braid))}
        >
          {t("reset")}
        </Button>
        <span className="type-caption ml-auto text-ink-3">
          {done
            ? t("arrived", { n: state.steps })
            : t("status", { round: state.round, n: state.steps })}
        </span>
      </div>
      {state.finished.length > 0 && (
        <p className="type-caption text-ink-2">
          {t("history", { steps: state.finished.join(" → ") })}
        </p>
      )}
    </Card>
  );
}
