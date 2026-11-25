"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  Select,
  Skeleton,
  cn,
} from "@/components/ui";
import { useErrorText } from "@console/components/useErrorText";
import {
  type TokenCreatedOut,
  type TokenIn,
  type TokenOut,
  ops,
} from "@console/lib/client";
import {
  TOKEN_DAYS,
  TOKEN_SCOPES,
  type TokenDraft,
  type TokenScope,
  checkToken,
  scopeKey,
  tokenActive,
  tokenRequest,
} from "../lib/documents";

/** The token just made: shown this once, with a copy button and what to do with it. */
function NewToken({
  token,
  onDone,
}: {
  token: TokenCreatedOut;
  onDone: () => void;
}) {
  const t = useTranslations("console.documents.tokens.created");
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  return (
    <div
      role="status"
      className="grid gap-3 rounded-[var(--radius-card)] border border-warn bg-warn-soft p-5 text-[14px]"
    >
      <p className="font-semibold">{t("title", { name: token.name })}</p>
      <p>{t("warning")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 rounded-md bg-surface px-3 py-2 font-mono text-[13px] break-all select-all">
          {token.token}
        </code>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(token.token);
              setCopied("yes");
            } catch {
              setCopied("no");
            }
          }}
        >
          {copied === "yes" ? t("copied") : t("copy")}
        </Button>
      </div>
      {copied === "no" && (
        <p className="text-[13px] text-danger">{t("copyFailed")}</p>
      )}
      <div>
        <Button size="sm" onClick={onDone}>
          {t("done")}
        </Button>
      </div>
    </div>
  );
}

/** One token's row, with its revocation behind a second click. */
function TokenRow({ token, now }: { token: TokenOut; now: Date }) {
  const t = useTranslations("console.documents.tokens");
  const tScope = useTranslations("console.documents.tokens.scope");
  const format = useFormatter();
  const errorText = useErrorText();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const revoke = useMutation({
    mutationFn: () =>
      ops.delete<void>(`tokens/${encodeURIComponent(token.id)}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["tokens"] }),
  });
  const active = tokenActive(token, now);
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium" });
  return (
    <li className="grid gap-2 border-b border-hairline px-5 py-4 text-[14px] last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={cn("font-medium", !active && "text-ink-3")}>
          {token.name}
        </span>
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-[12px] font-medium",
            active ? "bg-ok-soft text-ink" : "bg-surface-2 text-ink-3"
          )}
        >
          {token.revoked_at
            ? t("revoked")
            : active
              ? t("active")
              : t("expired")}
        </span>
      </div>
      <p className="text-[13px] text-ink-2">
        {token.scopes
          .map((s) =>
            (TOKEN_SCOPES as readonly string[]).includes(s)
              ? tScope(scopeKey(s as TokenScope))
              : s
          )
          .join(" · ")}
      </p>
      <p className="text-[12px] text-ink-3">
        {t("dates", {
          created: date(token.created_at),
          expires: date(token.expires_at),
        })}{" "}
        ·{" "}
        {token.last_used_at
          ? t("lastUsed", {
              when: format.relativeTime(new Date(token.last_used_at), now),
            })
          : t("neverUsed")}
      </p>
      {active && (
        <div className="flex flex-wrap items-center gap-2">
          {confirming ? (
            <>
              <span className="text-[13px]">{t("revokeConfirm")}</span>
              <Button
                size="sm"
                variant="danger"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate()}
              >
                {t("revokeYes")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirming(false)}
              >
                {t("revokeNo")}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setConfirming(true)}
            >
              {t("revoke")}
            </Button>
          )}
        </div>
      )}
      {revoke.isError && <ErrorBanner message={errorText(revoke.error)} />}
    </li>
  );
}

/**
 * Access tokens of the signed-in person (backend OPS-0005, "Claude's door"): a working
 * session reads and writes documents with one, never with a session. Each is named,
 * lives at most 90 days, carries document scopes only, and is shown once when made.
 */
export function TokensSection() {
  const t = useTranslations("console.documents.tokens");
  const tScope = useTranslations("console.documents.tokens.scope");
  const tError = useTranslations("console.documents.tokens.errors");
  const errorText = useErrorText();
  const client = useQueryClient();
  const tokens = useQuery({
    queryKey: ["tokens"],
    queryFn: () => ops.get<TokenOut[]>("tokens"),
  });
  const [draft, setDraft] = useState<TokenDraft>({
    name: "",
    scopes: ["documents:read", "documents:write"],
    days: 30,
  });
  const [tried, setTried] = useState(false);
  const [created, setCreated] = useState<TokenCreatedOut | null>(null);
  const errors = checkToken(draft);
  const create = useMutation({
    mutationFn: () =>
      ops.post<TokenCreatedOut>(
        "tokens",
        tokenRequest(draft) satisfies TokenIn
      ),
    onSuccess: (token) => {
      setCreated(token);
      setDraft((d) => ({ ...d, name: "" }));
      setTried(false);
      void client.invalidateQueries({ queryKey: ["tokens"] });
    },
  });
  const [now] = useState(() => new Date());

  return (
    <div className="grid max-w-3xl gap-6">
      <p className="text-ink-2">{t("intro")}</p>
      {created && <NewToken token={created} onDone={() => setCreated(null)} />}
      <Card>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTried(true);
            if (Object.keys(errors).length === 0) create.mutate();
          }}
        >
          <h2 className="type-heading">{t("newTitle")}</h2>
          <Field
            label={t("name")}
            hint={t("nameHint")}
            error={tried && errors.name ? tError(errors.name) : undefined}
          >
            <Input
              value={draft.name}
              maxLength={100}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
            />
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-[13px] font-medium text-ink-2">
              {t("scopes")}
            </legend>
            {TOKEN_SCOPES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-[14px]">
                <input
                  type="checkbox"
                  checked={draft.scopes.includes(s)}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      scopes: e.target.checked
                        ? [...d.scopes, s]
                        : d.scopes.filter((x) => x !== s),
                    }))
                  }
                />
                {tScope(scopeKey(s))}
                <span className="font-mono text-[12px] text-ink-3">{s}</span>
              </label>
            ))}
            {tried && errors.scopes && (
              <p role="alert" className="text-[13px] text-danger">
                {tError(errors.scopes)}
              </p>
            )}
          </fieldset>
          <Field label={t("expiry")} hint={t("expiryHint")}>
            <Select
              value={draft.days}
              onChange={(e) =>
                setDraft((d) => ({ ...d, days: Number(e.target.value) }))
              }
            >
              {TOKEN_DAYS.map((n) => (
                <option key={n} value={n}>
                  {t("days", { n })}
                </option>
              ))}
            </Select>
          </Field>
          {create.isError && <ErrorBanner message={errorText(create.error)} />}
          <div>
            <Button type="submit" disabled={create.isPending}>
              {t("create")}
            </Button>
          </div>
        </form>
      </Card>
      <section className="grid gap-2">
        <h2 className="type-heading">{t("yours")}</h2>
        {tokens.isError && <ErrorBanner message={errorText(tokens.error)} />}
        {tokens.isPending ? (
          <Skeleton className="h-24" />
        ) : tokens.data && tokens.data.length === 0 ? (
          <p className="text-[14px] text-ink-3">{t("none")}</p>
        ) : tokens.data ? (
          <Card inset>
            <ul>
              {tokens.data.map((token) => (
                <TokenRow key={token.id} token={token} now={now} />
              ))}
            </ul>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
