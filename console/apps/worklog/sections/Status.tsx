"use client";

import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Card, ErrorBanner, Skeleton, buttonClass } from "@/components/ui";
import { useErrorText } from "@console/components/useErrorText";
import { OpsRequestError, ops } from "@console/lib/client";
import { type Block, type Inline, parseMarkdown } from "../lib/markdown";
import { STATUS_FILE_HREF, type Status } from "../lib/worklog";

function Inlines({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((run, i) => {
        switch (run.kind) {
          case "link":
            return (
              <a
                key={i}
                href={run.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline-offset-2 hover:underline"
              >
                {run.text}
              </a>
            );
          case "strong":
            return <strong key={i}>{run.text}</strong>;
          case "em":
            return <em key={i}>{run.text}</em>;
          case "code":
            return (
              <code
                key={i}
                className="rounded bg-accent-soft px-1 font-mono text-[13px]"
              >
                {run.text}
              </code>
            );
          default:
            return <span key={i}>{run.text}</span>;
        }
      })}
    </>
  );
}

const HEADING_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: "type-heading mt-4",
  2: "type-heading mt-4",
  3: "mt-3 text-[15px] font-semibold",
  4: "mt-2 text-[14px] font-semibold text-ink-2",
};

function BlockView({ block }: { block: Block }): ReactNode {
  switch (block.kind) {
    case "heading": {
      const Tag = block.level <= 2 ? "h3" : "h4";
      return (
        <Tag className={HEADING_CLASS[block.level]}>
          <Inlines inlines={block.inlines} />
        </Tag>
      );
    }
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5 text-[14px] text-ink-2`}
        >
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines inlines={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "rule":
      return <hr className="border-hairline" />;
    default:
      return (
        <p className="text-[14px] text-ink-2">
          <Inlines inlines={block.inlines} />
        </p>
      );
  }
}

/**
 * The status report: where the project stands, where it is going, what is uncertain.
 * One Markdown page written by the coordinating session and imported with the log;
 * drawn here, downloadable as a file. Quiet until the first one is imported.
 */
export function StatusPanel() {
  const t = useTranslations("console.worklog.status");
  const format = useFormatter();
  const errorText = useErrorText();
  const status = useQuery({
    queryKey: ["worklog", "status"],
    queryFn: () => ops.get<Status>("worklog/status"),
    retry: false,
  });
  if (status.isPending) return <Skeleton className="h-32" />;
  if (status.isError) {
    if (
      status.error instanceof OpsRequestError &&
      status.error.code === "no_status"
    )
      return <p className="text-[13px] text-ink-3">{t("none")}</p>;
    return <ErrorBanner message={errorText(status.error)} />;
  }
  const report = status.data;
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="type-heading">{report.title}</h2>
          {report.updated && (
            <p className="text-[12px] text-ink-3">
              {t("updated", {
                date: format.dateTime(new Date(`${report.updated}T12:00:00`), {
                  dateStyle: "long",
                }),
              })}
            </p>
          )}
        </div>
        <a
          href={STATUS_FILE_HREF}
          className={buttonClass("secondary", "sm")}
          download
        >
          {t("download")}
        </a>
      </div>
      <div className="mt-2 space-y-2">
        {parseMarkdown(report.markdown).map((block, i) => (
          <BlockView key={i} block={block} />
        ))}
      </div>
    </Card>
  );
}
