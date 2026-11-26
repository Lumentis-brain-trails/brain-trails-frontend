"use client";

/**
 * The braided path, played by a class (Brain Plasticity): the teacher's screen shows
 * the network, each phone shows the coloured edges the pointer may take next, and the
 * class votes. The rules are `src/lib/learning/braid.ts`'s: a vote counts with its
 * edge's thickness; every vote lasts `VOTE_SECONDS`, counted down from 5 to 0 in big
 * numbers, then the pointer goes to the leader (a tie drawn by thickness); a crossed
 * edge thickens, unused ones thin between rounds; a dead spot is game over for the round
 * and prunes the edge into it. A round is about ten choices; after `ROUNDS` rounds the
 * class is asked what it sees, and can go on for more. There is no starting over: what
 * the network learned stays.
 *
 * The teacher's screen runs the loop; the server only counts (`useHostGame`).
 */
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BraidBoard,
  choiceColours,
  useRoundHistory,
} from "@/components/learning/BraidBoard";
import { Button, Card } from "@/components/ui";
import type { useHostGame } from "@/lib/classgame/useClassGame";
import {
  FOG,
  VOTE_SECONDS,
  type BraidState,
  choicesAt,
  deadEnd,
  decide,
  endRound,
  makeBraid,
  move,
  results,
  roundOver,
  startState,
} from "@/lib/learning/braid";

/** Rounds before the class is asked what it sees: enough for the path to thicken. */
export const ROUNDS = 5;
/** How long the class sees where it went before the next choice. */
const PAUSE_MS = 1200;
/** The solo version's seed, so the class meets the same network. */
const SEED = 4;

type Host = ReturnType<typeof useHostGame>;

export function BraidStage({ game }: { game: Host }) {
  const t = useTranslations("classGame.braid");
  const history = useRoundHistory();
  const braid = useMemo(() => makeBraid(SEED), []);
  const [state, setState] = useState<BraidState>(() => startState(braid));
  const [askedAt, setAskedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [between, setBetween] = useState(true); // before a round, or after one
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const resolving = useRef(false);
  const [nonce] = useState(() => Date.now().toString(36));

  const { view, askRound, close, reveal } = game;
  const live = game.socketState === "open";
  const current = view.question?.kind === "braid" ? view.question : null;
  const counts = useMemo(
    () => (current && view.tally ? view.tally.counts : {}),
    [current, view.tally]
  );

  // Asks the class at `s`; a node with a single way on is taken without a vote (the
  // room needs two options, and a vote with one answer is no choice).
  const ask = useCallback(
    function ask(s: BraidState) {
      const colours = choiceColours(braid, s);
      const ids = choicesAt(braid, s).map((e) => e.id);
      resolving.current = false;
      if (ids.length < 2) {
        setAskedAt(null);
        if (ids.length === 1) setTimeout(() => advance(ids[0]), PAUSE_MS);
        return;
      }
      askRound({
        id: `braid-${nonce}-${s.round}-${s.steps}`,
        kind: "braid",
        options: ids,
        buttons: ids.map((id) => ({ id, colour: colours[id] })),
        // phones count down from when the round reaches them
        seconds: VOTE_SECONDS,
      });
      setAskedAt(Date.now());

      function advance(edge: string) {
        const next = move(braid, stateRef.current, edge);
        setState(next);
        if (roundOver(braid, next)) setBetween(true);
        else ask(next);
      }
    },
    [askRound, braid, nonce]
  );

  const resolve = useCallback(
    (edge: string) => {
      if (resolving.current) return;
      resolving.current = true;
      setAskedAt(null);
      close();
      reveal(edge);
      setTimeout(() => {
        const next = move(braid, stateRef.current, edge);
        setState(next);
        if (roundOver(braid, next)) setBetween(true);
        else ask(next);
      }, PAUSE_MS);
    },
    [ask, braid, close, reveal]
  );

  // the clock for the countdown and the time limit
  useEffect(() => {
    if (askedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [askedAt]);

  const elapsed = askedAt === null ? 0 : now - askedAt;
  const timedOut = askedAt !== null && elapsed >= VOTE_SECONDS * 1000;
  useEffect(() => {
    if (askedAt === null || !current || view.phase !== "open") return;
    const edge = decide(braid, state, counts, view.players, { timedOut });
    if (edge) resolve(edge);
  }, [
    askedAt,
    current,
    view.phase,
    braid,
    state,
    counts,
    view.players,
    timedOut,
    resolve,
  ]);

  const done = roundOver(braid, state);
  const dead = deadEnd(braid, state);
  const enough = done && state.round >= ROUNDS;
  const startRound = () => {
    const next = done ? endRound(braid, state) : state;
    setState(next);
    setBetween(false);
    ask(next);
  };
  const finished = results(braid, state);

  return (
    <Card className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="type-heading">{t("title")}</h2>
          <p className="text-ink-2">
            {t("round", { round: state.round, steps: state.steps })}
          </p>
        </div>
        {askedAt !== null && (
          <div className="flex w-56 items-center gap-3" aria-hidden>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{
                  width: `${Math.max(0, 100 - (elapsed / (VOTE_SECONDS * 1000)) * 100)}%`,
                }}
              />
            </div>
            <span
              key={Math.max(0, Math.ceil(VOTE_SECONDS - elapsed / 1000))}
              className="type-display enter-pop w-14 text-right tabular-nums"
            >
              {Math.max(0, Math.ceil(VOTE_SECONDS - elapsed / 1000))}
            </span>
          </div>
        )}
      </header>

      <BraidBoard braid={braid} state={state} fog={FOG} votes={counts} />

      {finished.length > 0 && (
        <p className="text-sm text-ink-2">
          {t("history", { rounds: history(finished) })}
        </p>
      )}

      {between && (
        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
          {done && (
            <p className={dead ? "font-medium text-warn" : "text-ink-2"}>
              {t(dead ? "dead" : "arrived", { steps: state.steps })}
            </p>
          )}
          {enough && <p className="text-ink-2">{t("over")}</p>}
          <Button disabled={!live} onClick={startRound}>
            {t(done ? "next" : "start")}
          </Button>
        </div>
      )}
    </Card>
  );
}
