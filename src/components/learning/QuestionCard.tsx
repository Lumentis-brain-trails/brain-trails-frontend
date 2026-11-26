"use client";

/**
 * One Learning question, of any kind (`Question`): asked, answered, checked with
 * `isCorrect`, then explained.
 *
 * The explanation shows once the answer is right or the person asks for it, because the
 * point is the reasoning, not the score; a wrong answer can be changed and checked
 * again. In a teacher-paced lesson (`feedback: "held"`) the answer is only sent: no
 * right or wrong, no explanation, no way to peek, and it can be changed and sent again
 * until the teacher reveals it (`"revealed"`), when the last answer sent is judged. Ordering and matching work by dragging with a mouse and by tapping on a phone
 * or tablet (tap a picture, then tap where it goes), with arrows as a keyboard path.
 */
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { Button, Card, Icon, cn } from "@/components/ui";
import { LearningFigure } from "@/components/learning/LearningFigure";
import {
  type Answer,
  type Item,
  type Question,
  type Words,
  PARAM_SYMBOL,
  formatCode,
  isCorrect,
  round,
  shuffled,
} from "@/lib/learning/questions";
import { guessFigure, sliderStart } from "@/lib/learning/encoding";

/** Resolves `Words` against `learning.*`: keys are data here, checked by a unit test. */
export function useWords() {
  const t = useTranslations("learning");
  const plain = t as unknown as (
    key: string,
    values?: Record<string, string | number>
  ) => string;
  const rich = t.rich as unknown as (
    key: string,
    values?: Record<string, unknown>
  ) => ReactNode;
  return {
    text: (w: Words) => plain(w.key, w.values),
    rich: (w: Words) =>
      rich(w.key, {
        ...w.values,
        b: (c: ReactNode) => <strong className="font-semibold">{c}</strong>,
        i: (c: ReactNode) => <em>{c}</em>,
        p: (c: ReactNode) => <p>{c}</p>,
      }),
  };
}

type Verdict = "right" | "wrong" | "shown" | null;

/** When right or wrong is told: at once (alone), held until the teacher reveals, revealed. */
export type Feedback = "now" | "held" | "revealed";

/**
 * `onVerdict` hears every verdict after Check or Show answer (a wrong answer checked
 * again and now right reports "right"): the module uses it to show the next question,
 * and a teacher-paced lesson to count the class's answers without names.
 */
export function QuestionCard({
  question,
  index,
  onVerdict,
  feedback = "now",
}: {
  question: Question;
  index: number;
  /** The answer given rides along, so a live lesson can count which option was chosen. */
  onVerdict?: (verdict: "right" | "wrong" | "shown", answer: Answer) => void;
  feedback?: Feedback;
}) {
  const t = useTranslations("learning.question");
  const words = useWords();
  const [own, setAnswer] = useState<Answer>(() => initial(question));
  const [ownVerdict, setVerdict] = useState<Verdict>(null);
  const [version, setVersion] = useState(0);
  // a teacher-paced lesson: the last answer sent, and a look at the solution once revealed
  const [sent, setSent] = useState<Answer | null>(null);
  const [peek, setPeek] = useState(false);
  const held = feedback === "held";
  const revealed = feedback === "revealed";
  // once revealed, the card shows the answer sent (or the solution) and its verdict
  const [answer, verdict]: [Answer, Verdict] = !revealed
    ? [own, held ? null : ownVerdict]
    : sent && !peek
      ? [sent, isCorrect(question, sent) ? "right" : "wrong"]
      : [solution(question), "shown"];
  const sentNow = sent !== null && JSON.stringify(sent) === JSON.stringify(own);

  const change = (a: Answer) => {
    setAnswer(a);
    if (verdict === "wrong") setVerdict(null);
  };
  const check = () => {
    const v = isCorrect(question, answer) ? "right" : "wrong";
    if (held) setSent(answer);
    else setVerdict(v);
    onVerdict?.(v, answer);
  };
  const show = () => {
    setAnswer(solution(question));
    setVersion((v) => v + 1);
    setVerdict("shown");
    onVerdict?.("shown", solution(question));
  };
  const reset = () => {
    setAnswer(initial(question));
    setVersion((v) => v + 1);
    setVerdict(null);
  };
  const done = revealed || verdict === "right" || verdict === "shown";

  return (
    <Card
      className={cn(
        "space-y-4 transition-shadow duration-500",
        verdict === "right" && "learning-right ring-2 ring-ok"
      )}
    >
      <div className="flex items-start gap-3">
        <span className="type-eyebrow mt-1 shrink-0 text-ink-3">
          {t("number", { n: index + 1 })}
        </span>
        <p className="type-subhead text-pretty">
          {words.rich(question.prompt)}
        </p>
      </div>

      {"figures" in question &&
        question.figures &&
        !("sliders" in question && question.sliders) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {question.figures.map((f, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-xl border border-hairline p-2",
                  question.figures?.length === 1 && "sm:col-span-2"
                )}
              >
                <LearningFigure spec={f} />
              </div>
            ))}
          </div>
        )}

      <Body
        key={`${version}-${feedback}-${peek}`}
        question={question}
        answer={answer}
        onChange={change}
        locked={done}
        right={verdict === "right"}
        judge={!held}
      />

      <div className="flex flex-wrap items-center gap-2">
        {!done && (
          <Button size="sm" onClick={check} disabled={held && sentNow}>
            {t(held ? "send" : "check")}
          </Button>
        )}
        {!done && !held && (
          <Button size="sm" variant="ghost" onClick={show}>
            {t("show")}
          </Button>
        )}
        {held && sentNow && (
          <span className="inline-flex items-center gap-1.5 text-ink-2">
            <Icon name="check" /> {t("sent")}
          </span>
        )}
        {!done && (question.kind === "order" || question.kind === "match") && (
          <Button size="sm" variant="ghost" onClick={reset}>
            {t("reset")}
          </Button>
        )}
        {done && !revealed && (
          <Button size="sm" variant="secondary" onClick={reset}>
            {t("again")}
          </Button>
        )}
        {revealed && verdict === "wrong" && (
          <Button size="sm" variant="ghost" onClick={() => setPeek(true)}>
            {t("show")}
          </Button>
        )}
        {verdict === "right" && (
          <span className="inline-flex items-center gap-1.5 font-medium text-ok">
            <Icon name="check" /> {t("right")}
          </span>
        )}
        {verdict === "wrong" && (
          <span className="font-medium text-warn">
            {t(revealed ? "wrongSent" : "wrong")}
          </span>
        )}
        {revealed && !sent && (
          <span className="text-ink-2">{t("notSent")}</span>
        )}
      </div>

      {done && (
        <div className="space-y-2 rounded-xl bg-surface-2 p-4 text-pretty text-ink-2 [&_p+p]:mt-2">
          {words.rich(question.explain)}
        </div>
      )}
    </Card>
  );
}

/** The empty answer each kind starts from (orders start shuffled, the same everywhere). */
function initial(q: Question): Answer {
  switch (q.kind) {
    case "count":
      return { kind: "count", value: Number.NaN };
    case "value":
      return {
        kind: "value",
        values: q.sliders ? sliderStart(q) : q.labels.map(() => Number.NaN),
      };
    case "choice":
      return { kind: "choice", id: "" };
    case "order":
      return { kind: "order", ids: shuffled(q.answer, q.id) };
    case "match":
      return { kind: "match", placed: {} };
  }
}

/** The right answer, to show it. */
function solution(q: Question): Answer {
  switch (q.kind) {
    case "count":
      return { kind: "count", value: q.answer };
    case "value":
      return { kind: "value", values: q.answer };
    case "choice":
      return { kind: "choice", id: q.answer };
    case "order":
      return { kind: "order", ids: q.answer };
    case "match":
      return { kind: "match", placed: q.answer };
  }
}

function Body({
  question,
  answer,
  onChange,
  locked,
  right,
  judge,
}: {
  question: Question;
  answer: Answer;
  onChange: (a: Answer) => void;
  locked: boolean;
  right: boolean;
  /** Whether sliders may turn green when right (not while a lesson holds it back). */
  judge: boolean;
}) {
  if (question.kind === "count" && answer.kind === "count")
    return (
      <CountInput
        value={answer.value}
        locked={locked}
        onChange={(value) => onChange({ kind: "count", value })}
      />
    );
  if (question.kind === "value" && answer.kind === "value" && question.sliders)
    return (
      <ValueSliders
        question={question}
        values={answer.values}
        locked={locked}
        judge={judge}
        onChange={(values) => onChange({ kind: "value", values })}
      />
    );
  if (question.kind === "value" && answer.kind === "value")
    return (
      <div className="flex flex-wrap gap-4">
        {question.labels.map((name, i) => (
          <label key={name} className="flex items-center gap-2">
            <span className="font-mono text-[15px]">
              {PARAM_SYMBOL[name]} =
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              disabled={locked}
              value={Number.isNaN(answer.values[i]) ? "" : answer.values[i]}
              onChange={(e) => {
                const values = [...answer.values];
                values[i] =
                  e.target.value === "" ? Number.NaN : Number(e.target.value);
                onChange({ kind: "value", values });
              }}
              className="h-10 w-24 rounded-[var(--radius-control)] border border-hairline-strong bg-surface px-3 tabular-nums"
            />
          </label>
        ))}
      </div>
    );
  if (question.kind === "choice" && answer.kind === "choice")
    return (
      <Choices
        // the same order on every screen (seeded by the question), so a class sees
        // the same list; true/false stays in its natural order
        options={
          question.options.every((o) => o.id === "true" || o.id === "false")
            ? question.options
            : shuffled(question.options, question.id)
        }
        selected={answer.id}
        locked={locked}
        right={right}
        onPick={(id) => onChange({ kind: "choice", id })}
      />
    );
  if (question.kind === "order" && answer.kind === "order")
    return (
      <OrderList
        items={question.items}
        ids={answer.ids}
        locked={locked}
        right={right}
        onChange={(ids) => onChange({ kind: "order", ids })}
      />
    );
  if (question.kind === "match" && answer.kind === "match")
    return (
      <MatchBoard
        question={question}
        placed={answer.placed}
        locked={locked}
        right={right}
        onChange={(placed) => onChange({ kind: "match", placed })}
      />
    );
  return null;
}

/**
 * A value question answered on sliders, one per number: the figure draws the guess over
 * the target as the sliders move, and turns green once every number is close enough
 * (`judge`: never while a teacher-paced lesson holds the verdict back).
 */
function ValueSliders({
  question,
  values,
  locked,
  judge,
  onChange,
}: {
  question: Extract<Question, { kind: "value" }>;
  values: number[];
  locked: boolean;
  judge: boolean;
  onChange: (values: number[]) => void;
}) {
  const t = useTranslations("learning.question");
  const ok = judge && isCorrect(question, { kind: "value", values });
  const figure = guessFigure(question, values, ok);
  return (
    <div className="space-y-4">
      {figure && (
        <div className="rounded-xl border border-hairline p-2">
          <LearningFigure spec={figure} className="mx-auto max-w-2xl" />
          <p className="type-caption mt-1 text-center text-ink-3">
            {t("sliderHint")}
          </p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {question.labels.map((name, i) => {
          const sl = question.sliders?.[i];
          if (!sl) return null;
          return (
            <label key={name} className="block">
              <span className="flex justify-between font-mono text-[15px] tabular-nums">
                <span>{PARAM_SYMBOL[name]}</span>
                <span>{round(values[i])}</span>
              </span>
              <input
                type="range"
                min={sl.min}
                max={sl.max}
                step={sl.step}
                disabled={locked}
                value={values[i]}
                onChange={(e) => {
                  const next = [...values];
                  next[i] = Number(e.target.value);
                  onChange(next);
                }}
                className={cn(
                  "w-full",
                  ok ? "accent-[var(--ok)]" : "accent-[var(--accent)]"
                )}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

function CountInput({
  value,
  locked,
  onChange,
}: {
  value: number;
  locked: boolean;
  onChange: (v: number) => void;
}) {
  const t = useTranslations("learning.question");
  const n = Number.isNaN(value) ? 0 : value;
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={locked || n <= 0}
        aria-label={t("less")}
        onClick={() => onChange(Math.max(0, n - 1))}
      >
        −
      </Button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        disabled={locked}
        value={Number.isNaN(value) ? "" : value}
        aria-label={t("howMany")}
        onChange={(e) =>
          onChange(
            e.target.value === ""
              ? Number.NaN
              : Math.round(Number(e.target.value))
          )
        }
        className="type-figure h-12 w-20 rounded-[var(--radius-control)] border border-hairline-strong bg-surface text-center"
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={locked}
        aria-label={t("more")}
        onClick={() => onChange(n + 1)}
      >
        +
      </Button>
    </div>
  );
}

function ItemFace({ item }: { item: Item }) {
  const words = useWords();
  return (
    <>
      {item.figure && <LearningFigure spec={item.figure} />}
      {item.words && (
        <span className="text-pretty">{words.text(item.words)}</span>
      )}
    </>
  );
}

function Choices({
  options,
  selected,
  locked,
  right,
  onPick,
}: {
  options: Item[];
  selected: string;
  locked: boolean;
  right: boolean;
  onPick: (id: string) => void;
}) {
  const pictures = options.some((o) => o.figure);
  return (
    <div
      role="radiogroup"
      className={cn(
        "grid gap-2",
        !pictures
          ? "grid-cols-1"
          : options.length === 4
            ? "grid-cols-2 lg:grid-cols-4"
            : "grid-cols-1 sm:grid-cols-3"
      )}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={selected === o.id}
          disabled={locked}
          onClick={() => onPick(o.id)}
          className={cn(
            "pressable rounded-xl border p-3 text-left transition-colors",
            selected === o.id && right
              ? "border-ok bg-ok-soft"
              : selected === o.id
                ? "border-accent bg-accent-soft"
                : "border-hairline hover:bg-surface-2"
          )}
        >
          <ItemFace item={o} />
        </button>
      ))}
    </div>
  );
}

/**
 * Items to put in order. Drag one onto another to move it there (mouse), tap one and
 * then tap where it goes (touch), or use its arrows (keyboard).
 */
function OrderList({
  items,
  ids,
  locked,
  right,
  onChange,
}: {
  items: Item[];
  ids: string[];
  locked: boolean;
  right: boolean;
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations("learning.question");
  const [held, setHeld] = useState<string | null>(null);
  const byId = new Map(items.map((i) => [i.id, i]));
  const pictures = items.some((i) => i.figure);
  const move = (id: string, to: number) => {
    const next = ids.filter((x) => x !== id);
    next.splice(to, 0, id);
    onChange(next);
  };
  return (
    <div>
      {!locked && (
        <p className="type-caption mb-2 text-ink-3">{t("orderHint")}</p>
      )}
      <ol
        className={cn(
          "grid gap-2",
          pictures ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1"
        )}
      >
        {ids.map((id, i) => {
          const item = byId.get(id);
          if (!item) return null;
          return (
            <li
              key={id}
              draggable={!locked}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", id);
                setHeld(id);
              }}
              onDragEnd={() => setHeld(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = e.dataTransfer.getData("text/plain");
                if (from) move(from, i);
                setHeld(null);
              }}
              onClick={() => {
                if (locked) return;
                if (held && held !== id) {
                  move(held, i);
                  setHeld(null);
                } else setHeld(held === id ? null : id);
              }}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-surface p-3 select-none",
                pictures && "flex-col items-stretch",
                !locked && "cursor-grab",
                right
                  ? "border-ok bg-ok-soft"
                  : held === id
                    ? "border-accent bg-accent-soft"
                    : "border-hairline"
              )}
            >
              <span className="type-figure w-6 shrink-0 text-[18px] text-ink-3">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <ItemFace item={item} />
              </div>
              {!locked && (
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={t("up")}
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      move(id, i - 1);
                    }}
                    className="pressable rounded-full p-1.5 text-ink-2 hover:bg-surface-2 disabled:opacity-30"
                  >
                    <Icon name="chevron" className="-rotate-90" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("down")}
                    disabled={i === ids.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      move(id, i + 1);
                    }}
                    className="pressable rounded-full p-1.5 text-ink-2 hover:bg-surface-2 disabled:opacity-30"
                  >
                    <Icon name="chevron" className="rotate-90" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Pictures to drop onto their codes. A slot holds one picture; dropping onto a full slot
 * swaps the one already there back to the tray. Tap a picture, then tap a slot, on a
 * touch screen; tap a placed picture to take it back.
 */
function MatchBoard({
  question,
  placed,
  locked,
  right,
  onChange,
}: {
  question: Extract<Question, { kind: "match" }>;
  placed: Record<string, string>;
  locked: boolean;
  right: boolean;
  onChange: (placed: Record<string, string>) => void;
}) {
  const t = useTranslations("learning.question");
  const words = useWords();
  const [held, setHeld] = useState<string | null>(null);
  const tray = shuffled(question.items, question.id).filter(
    (i) => !placed[i.id]
  );
  const inSlot = (slot: string) =>
    question.items.find((i) => placed[i.id] === slot);
  const put = (item: string, slot: string) => {
    const next = { ...placed };
    for (const [k, v] of Object.entries(next)) if (v === slot) delete next[k];
    next[item] = slot;
    onChange(next);
    setHeld(null);
  };
  const takeBack = (item: string) => {
    const next = { ...placed };
    delete next[item];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {!locked && <p className="type-caption text-ink-3">{t("matchHint")}</p>}
      {tray.length > 0 && (
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-2 sm:grid-cols-3 lg:grid-cols-5">
          {tray.map((item) => (
            <button
              key={item.id}
              type="button"
              draggable={!locked}
              disabled={locked}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", item.id);
                setHeld(item.id);
              }}
              onDragEnd={() => setHeld(null)}
              onClick={() => setHeld(held === item.id ? null : item.id)}
              className={cn(
                "pressable cursor-grab rounded-xl border bg-surface p-2",
                held === item.id
                  ? "border-accent ring-2 ring-accent"
                  : "border-hairline"
              )}
            >
              <ItemFace item={item} />
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {question.slots.map((slot) => {
          const item = inSlot(slot.id);
          return (
            <div
              key={slot.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id && !locked) put(id, slot.id);
              }}
              onClick={() => {
                if (!locked && held) put(held, slot.id);
              }}
              className={cn(
                "flex min-h-28 flex-col gap-2 rounded-xl border border-dashed p-2",
                right
                  ? "border-solid border-ok bg-ok-soft"
                  : held && !locked
                    ? "cursor-pointer border-accent"
                    : "border-hairline-strong"
              )}
            >
              <span className="text-center font-mono text-[14px] tabular-nums">
                {slot.words
                  ? words.text(slot.words)
                  : slot.count !== undefined
                    ? t("numbers", { n: slot.count })
                    : formatCode(slot.code ?? [])}
              </span>
              {item ? (
                <button
                  type="button"
                  disabled={locked}
                  onClick={(e) => {
                    e.stopPropagation();
                    takeBack(item.id);
                  }}
                  className="rounded-lg bg-surface p-1"
                >
                  <ItemFace item={item} />
                </button>
              ) : (
                <span className="type-caption m-auto text-ink-3">
                  {t("dropHere")}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
