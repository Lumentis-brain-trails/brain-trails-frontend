"use client";

/**
 * "Who is being recorded?" - the pre-flight's subject picker (backend T3, operator mode).
 *
 * In a clinic or a laboratory the person at the computer may record themself, as
 * before, or one of the people they care for: the session is then recorded in the
 * organisation, for that subject, and only their carers read it. A subject whose consent
 * has not been attested is listed but cannot be chosen (the backend would answer 409).
 * When the chosen subject has an open assignment of this protocol, the run counts
 * towards it unless the operator says otherwise.
 *
 * Renders nothing outside an organisation or with organisations off: a private user's
 * Play is unchanged.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { useFeature } from "@/lib/features";
import {
  type Assignment,
  recordable,
  runsLeft,
  subjectLabel,
  subjectWords,
  useSubjects,
} from "@/lib/subjects";
import { editionOf, useCurrentWorkspace } from "@/lib/workspace";
import { Card, Select } from "@/components/ui";

/** The person a run records and the assignment it counts towards; empty = the caller. */
export interface RunTarget {
  subjectId?: string;
  assignmentId?: string;
}

export function SubjectPicker({
  protocolId,
  value,
  onChange,
}: {
  protocolId: string;
  value: RunTarget;
  onChange: (target: RunTarget) => void;
}) {
  const t = useTranslations("picker");
  const tSubjects = useTranslations("subjects");
  const multi = useFeature("workspaces_multi");
  const assignmentsOn = useFeature("assignments");
  const workspace = useCurrentWorkspace();
  const organisation =
    multi && workspace !== undefined && workspace.kind !== "personal";
  const subjects = useSubjects(workspace?.id, {
    view: "mine",
    enabled: organisation,
  });
  const open = useQuery({
    queryKey: [
      "assignments",
      workspace?.id,
      value.subjectId,
      protocolId,
      "open",
    ],
    queryFn: () =>
      api.get<Assignment[]>(
        `workspaces/${workspace?.id}/assignments?subject=${value.subjectId}` +
          `&protocol=${protocolId}&open=true`
      ),
    enabled: organisation && assignmentsOn && value.subjectId !== undefined,
  });
  const runnable = (open.data ?? []).find((a) => a.open);

  // The first open assignment is counted unless the operator unticks it; a subject
  // with none clears the choice.
  useEffect(() => {
    if (!value.subjectId || open.isLoading) return;
    if (runnable && value.assignmentId === undefined)
      onChange({ ...value, assignmentId: runnable.id });
    if (!runnable && value.assignmentId !== undefined)
      onChange({ subjectId: value.subjectId });
    // `value` and `onChange` change with every keystroke of the parent; the decision
    // depends only on which subject is chosen and what it has open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.subjectId, runnable?.id, open.isLoading]);

  if (!organisation) return null;
  const words = subjectWords(editionOf(workspace?.kind));
  const left = runnable ? runsLeft(runnable) : null;

  return (
    <Card className="mb-6">
      <h2 className="type-subhead mb-2">{tSubjects(`${words}.who`)}</h2>
      <p className="mb-4 text-[14px] text-ink-2">{t("intro")}</p>
      <Select
        aria-label={t("title")}
        value={value.subjectId ?? ""}
        onChange={(e) =>
          onChange(e.target.value ? { subjectId: e.target.value } : {})
        }
      >
        <option value="">{t("myself")}</option>
        {(subjects.data ?? []).map((s) => (
          <option key={s.id} value={s.id} disabled={!recordable(s)}>
            {recordable(s)
              ? `${subjectLabel(s)}${s.display_name ? ` · ${s.code}` : ""}`
              : t("noConsent", { name: subjectLabel(s) })}
          </option>
        ))}
      </Select>
      {runnable && (
        <label className="mt-4 flex cursor-pointer items-start gap-3 text-[14px]">
          <input
            type="checkbox"
            checked={value.assignmentId === runnable.id}
            onChange={(e) =>
              onChange({
                subjectId: value.subjectId,
                assignmentId: e.target.checked ? runnable.id : "",
              })
            }
            className="mt-0.5 h-5 w-5 rounded-md accent-(--accent)"
          />
          <span>
            {left === null ? t("countsOpen") : t("countsTowards", { left })}
          </span>
        </label>
      )}
    </Card>
  );
}

/** What `startSession` takes from a picked target: an unticked assignment is none. */
export function startOptions(target: RunTarget): {
  subjectId?: string;
  assignmentId?: string;
} {
  return {
    ...(target.subjectId ? { subjectId: target.subjectId } : {}),
    ...(target.assignmentId ? { assignmentId: target.assignmentId } : {}),
  };
}
