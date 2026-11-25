"use client";

/**
 * A session in rounds (V4-0013), on its recording page: per round, how much of the game
 * the light was on, how much of the following rest the person stayed there with no help,
 * and the hands' level; then the first rest against the last.
 *
 * What happened, never whether it worked (V4-0009): the words say "stayed there", not
 * "learnt", and there is no verdict. Nothing is drawn for a session without a game. The
 * rows come from `GET /recordings/{id}/rounds`, computed from the stored block rows; a
 * rest on the landscape says "not yet" until the person's map has placed it.
 */

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { Card, SectionTitle } from "@/components/ui";

export type Rounds = components["schemas"]["RoundsOut"];

const pct = (share: number | null | undefined) =>
  share === null || share === undefined ? null : `${Math.round(share * 100)}%`;

export function RoundsCard({ recordingId }: { recordingId: string }) {
  const t = useTranslations("recordings.rounds");
  const rounds = useQuery({
    queryKey: ["rounds", recordingId],
    queryFn: () => api.get<Rounds>(`recordings/${recordingId}/rounds`),
  });
  return <RoundsView rounds={rounds.data} t={t} />;
}

/** The card itself, for a given answer; nothing for none or for no rounds. */
export function RoundsView({
  rounds,
  t,
}: {
  rounds: Rounds | undefined;
  t: ReturnType<typeof useTranslations<"recordings.rounds">>;
}) {
  if (!rounds || rounds.rounds.length === 0) return null;
  const pending = t("pending");
  const first = rounds.first_vs_last?.first.share;
  const last = rounds.first_vs_last?.last.share;
  return (
    <section className="mt-8">
      <SectionTitle>{t("title")}</SectionTitle>
      <Card inset>
        <table className="w-full text-left text-[14px] tabular-nums">
          <thead className="text-ink-3">
            <tr>
              <th className="py-1 font-medium">{t("round")}</th>
              <th className="py-1 font-medium">{t("game")}</th>
              <th className="py-1 font-medium">{t("after")}</th>
              <th className="py-1 font-medium">{t("level")}</th>
            </tr>
          </thead>
          <tbody>
            {rounds.rounds.map((r, i) => (
              <tr key={r.game} className="border-t border-line">
                <td className="py-1.5">{i + 1}</td>
                <td className="py-1.5">{pct(r.in_target_share) ?? "-"}</td>
                <td className="py-1.5">{pct(r.transfer) ?? pending}</td>
                <td className="py-1.5">
                  {r.level === null
                    ? "-"
                    : r.next_level === null || r.next_level === r.level
                      ? r.level
                      : `${r.level} → ${r.next_level}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rounds.first_vs_last && (
          <p className="mt-4 text-[15px] text-ink-2">
            {first !== null &&
            first !== undefined &&
            last !== null &&
            last !== undefined
              ? t("firstLast", { first: pct(first)!, last: pct(last)! })
              : t("firstLastPending")}
          </p>
        )}
        <p className="type-caption mt-3 text-ink-3">{t("disclaimer")}</p>
      </Card>
    </section>
  );
}
