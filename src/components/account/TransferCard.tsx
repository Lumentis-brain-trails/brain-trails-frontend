"use client";

/**
 * Admins only: send your own recordings to another environment (backend `app.transfers`).
 *
 * Each environment knows which others may import from it (`GET /transfers/peers`).
 * Pressing a button makes a one-time link here (`POST /transfers/exports`) and opens
 * the target's import page with the link in the URL fragment. A fragment never reaches
 * a server or its logs. The target redeems the link itself, server to server. Nothing
 * else moves: only the recordings of the admin who pressed the button, and only towards
 * environments that accept them (never into prod).
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import {
  envKey,
  importUrl,
  type TransferExport,
  type TransferPeers,
} from "@/lib/transfers";
import { Card, ErrorBanner, Icon, SectionTitle } from "@/components/ui";

export function TransferCard() {
  const t = useTranslations("transfers");
  const errorMessage = useErrorMessage();
  const peers = useQuery({
    queryKey: ["transfer-peers"],
    queryFn: () => api.get<TransferPeers>("transfers/peers"),
    retry: false,
  });
  const send = useMutation({
    mutationFn: async (webUrl: string) => {
      const link = await api.post<TransferExport>("transfers/exports");
      return importUrl(webUrl, link.source, link.token);
    },
    onSuccess: (url) => window.location.assign(url),
  });

  const data = peers.data;
  if (!data || (data.export_to.length === 0 && data.import_from.length === 0)) {
    return null;
  }
  return (
    <section>
      <SectionTitle>{t("title")}</SectionTitle>
      <Card inset>
        {data.export_to.map((target) => (
          <button
            key={target.env}
            type="button"
            disabled={send.isPending}
            onClick={() => send.mutate(target.web_url)}
            className="pressable flex w-full items-center justify-between gap-3 border-b border-hairline px-5 py-3.5 text-left last:border-b-0 hover:bg-surface-2 disabled:opacity-50"
          >
            <span>
              <span className="block">
                {t("send", { env: t(`env.${envKey(target.env)}`) })}
              </span>
              <span className="type-caption text-ink-3">
                {t("sendHint", { env: t(`env.${envKey(target.env)}`) })}
              </span>
            </span>
            <Icon name="chevron" className="text-ink-3" />
          </button>
        ))}
        {data.import_from.length > 0 && (
          <p className="type-caption px-5 py-3.5 text-ink-3">
            {t("receiveHint", {
              sources: data.import_from
                .map((env) => t(`env.${envKey(env)}`))
                .join(" / "),
              here: t(`env.${envKey(data.env)}`),
            })}
          </p>
        )}
      </Card>
      {send.error && (
        <div className="mt-3">
          <ErrorBanner message={errorMessage(send.error)} />
        </div>
      )}
    </section>
  );
}
