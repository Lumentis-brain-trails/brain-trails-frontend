"use client";

/**
 * The account's context variables: which questions are asked before every recording.
 *
 * Built-in questions can be turned off and, for the choice ones ("How do you feel",
 * "In the last 2 hours I..."), given options of the person's own. Questions of their own
 * can be added and removed. Nothing is deleted on the server: what is removed is kept
 * archived, so answers given to it stay readable (backend `app/context.py`). Every
 * change is saved at once as the whole personalisation (`PUT /context-variables`).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  ListRow,
  SectionTitle,
  Segmented,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { useContextWords } from "@/components/context/contextWords";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import {
  CONTEXT_QUERY_KEY,
  type ContextItem,
  type ContextVariables,
  type ContextVariablesIn,
  type CustomItemIn,
  customKey,
  settingsFrom,
  splitEmoji,
  useContextVariables,
} from "@/lib/context";

type NewKind = CustomItemIn["kind"];

export function ContextSettingsCard() {
  const t = useTranslations("context.settings");
  const words = useContextWords();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const list = useContextVariables();
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: ContextVariablesIn) =>
      api.put<ContextVariables>("context-variables", body),
    onSuccess: (data) => {
      setError(null);
      queryClient.setQueryData(CONTEXT_QUERY_KEY, data);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (!list.data)
    return (
      <section id="context">
        <SectionTitle>{t("title")}</SectionTitle>
        <Card>
          {list.isError ? (
            <ErrorBanner message={errorMessage(list.error)} />
          ) : (
            <Skeleton className="h-5 w-2/3" />
          )}
        </Card>
      </section>
    );

  const items = list.data.items;
  const current = settingsFrom(items);
  const taken = items.flatMap((i) => [i.key, ...i.options.map((o) => o.key)]);
  const builtins = items.filter((i) => !i.custom);
  const mine = items.filter((i) => i.custom && !i.archived);

  const toggle = (item: ContextItem) =>
    save.mutate({
      ...current,
      hidden: item.hidden
        ? current.hidden.filter((k) => k !== item.key)
        : [...current.hidden, item.key],
    });
  const addOption = (item: ContextItem, line: string) => {
    const { emoji, label } = splitEmoji(line);
    if (!label) return;
    save.mutate({
      ...current,
      extra_options: {
        ...current.extra_options,
        [item.key]: [
          ...(current.extra_options[item.key] ?? []),
          { key: customKey(label, taken), label, emoji },
        ],
      },
    });
  };
  const removeOption = (item: ContextItem, key: string) =>
    save.mutate({
      ...current,
      extra_options: {
        ...current.extra_options,
        [item.key]: (current.extra_options[item.key] ?? []).filter(
          (o) => o.key !== key
        ),
      },
    });
  const removeItem = (key: string) =>
    save.mutate({
      ...current,
      custom: current.custom.filter((c) => c.key !== key),
    });

  return (
    <section id="context">
      <SectionTitle>{t("title")}</SectionTitle>
      <p className="mb-3 text-ink-2">{t("hint")}</p>
      {error && (
        <div className="mb-3">
          <ErrorBanner message={error} />
        </div>
      )}
      <Card inset>
        {builtins.map((item) => (
          <ListRow key={item.key} className="flex-col items-stretch gap-2">
            <div className="flex items-center justify-between gap-4">
              <span className={item.hidden ? "text-ink-3" : undefined}>
                {words.item(item)}
              </span>
              <Segmented
                label={words.item(item)}
                value={item.hidden ? "off" : "on"}
                onChange={(v) => (v === "on") === item.hidden && toggle(item)}
                options={[
                  { value: "on", label: t("asked") },
                  { value: "off", label: t("notAsked") },
                ]}
              />
            </div>
            {item.kind === "multi" && !item.hidden && (
              <OwnOptions
                item={item}
                busy={save.isPending}
                onAdd={(line) => addOption(item, line)}
                onRemove={(key) => removeOption(item, key)}
              />
            )}
          </ListRow>
        ))}
      </Card>

      <h3 className="type-subhead mt-6 mb-2">{t("mineTitle")}</h3>
      <Card inset>
        {mine.length === 0 && (
          <ListRow>
            <span className="text-ink-3">{t("mineEmpty")}</span>
          </ListRow>
        )}
        {mine.map((item) => (
          <ListRow key={item.key} className="justify-between">
            <span>
              {item.emoji ? `${item.emoji} ` : ""}
              {item.label}
              <span className="type-caption ml-2 text-ink-3">
                {t(`kinds.${item.kind as NewKind}`)}
              </span>
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={save.isPending}
              onClick={() => removeItem(item.key)}
            >
              {t("remove")}
            </Button>
          </ListRow>
        ))}
        <NewQuestion
          busy={save.isPending}
          onAdd={(item) =>
            save.mutate({
              ...current,
              custom: [
                ...current.custom,
                { ...item, key: customKey(item.label, taken) },
              ],
            })
          }
        />
      </Card>
    </section>
  );
}

function OwnOptions({
  item,
  busy,
  onAdd,
  onRemove,
}: {
  item: ContextItem;
  busy: boolean;
  onAdd: (line: string) => void;
  onRemove: (key: string) => void;
}) {
  const t = useTranslations("context.settings");
  const [line, setLine] = useState("");
  const own = item.options.filter((o) => o.custom && !o.archived);
  return (
    <div className="space-y-2">
      {own.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {own.map((o) => (
            <span
              key={o.key}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-hairline pr-1 pl-3 text-[14px]"
            >
              {o.emoji} {o.label}
              <button
                type="button"
                className="pressable rounded-full px-2 text-ink-3 hover:text-danger"
                aria-label={t("removeOption", { option: o.label ?? o.key })}
                disabled={busy}
                onClick={() => onRemove(o.key)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(line);
          setLine("");
        }}
      >
        <Input
          value={line}
          placeholder={t("optionPlaceholder")}
          aria-label={t("addOption")}
          maxLength={90}
          onChange={(e) => setLine(e.target.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={busy || !splitEmoji(line).label}
        >
          {t("add")}
        </Button>
      </form>
    </div>
  );
}

function NewQuestion({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (item: Omit<CustomItemIn, "key">) => void;
}) {
  const t = useTranslations("context.settings");
  const [kind, setKind] = useState<NewKind>("scale");
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");

  const { emoji, label } = splitEmoji(title);
  const options = lines
    .split("\n")
    .map(splitEmoji)
    .filter((o) => o.label);
  const ready = label && (kind === "scale" || options.length >= 2);

  return (
    <form
      className="space-y-4 border-t border-hairline px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        const keys: string[] = [];
        onAdd({
          kind,
          label,
          emoji,
          options:
            kind === "scale"
              ? []
              : options.map((o) => {
                  const key = customKey(o.label, keys);
                  keys.push(key);
                  return { key, label: o.label, emoji: o.emoji };
                }),
          low_label: kind === "scale" && low.trim() ? low.trim() : null,
          high_label: kind === "scale" && high.trim() ? high.trim() : null,
        });
        setTitle("");
        setLines("");
        setLow("");
        setHigh("");
      }}
    >
      <p className="font-medium">{t("newTitle")}</p>
      <Field label={t("question")} hint={t("questionHint")}>
        <Input
          value={title}
          maxLength={90}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Segmented
        label={t("kind")}
        value={kind}
        onChange={setKind}
        options={(["scale", "single", "multi"] as const).map((k) => ({
          value: k,
          label: t(`kinds.${k}`),
        }))}
      />
      {kind === "scale" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("low")}>
            <Input
              value={low}
              maxLength={80}
              onChange={(e) => setLow(e.target.value)}
            />
          </Field>
          <Field label={t("high")}>
            <Input
              value={high}
              maxLength={80}
              onChange={(e) => setHigh(e.target.value)}
            />
          </Field>
        </div>
      ) : (
        <Field label={t("options")} hint={t("optionsHint")}>
          <Textarea value={lines} onChange={(e) => setLines(e.target.value)} />
        </Field>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !ready}>
          {t("addQuestion")}
        </Button>
      </div>
    </form>
  );
}
