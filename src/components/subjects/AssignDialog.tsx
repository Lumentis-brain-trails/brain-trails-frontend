"use client";

/**
 * Give a protocol to a patient or participant (backend T3): from their page, where the
 * person is fixed and the protocol is chosen, or from a protocol's page, where it is the
 * other way round.
 *
 * The protocols offered are the ones the carer could run themself and that are
 * published - their organisation's library, the community shelf, the official catalog -
 * because the backend assigns the current version and refuses a draft. The note is
 * shown to the person on their card; the due date sets the reminder.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import { type ProtocolCard, isPlayable } from "@/lib/protocol/catalog";
import { useOfficialTexts } from "@/lib/protocol/official";
import {
  type Assignment,
  type AssignmentIn,
  dueAtFromDate,
  subjectLabel,
  useSubjects,
} from "@/lib/subjects";
import { Sheet } from "@/components/Sheet";
import {
  Button,
  ErrorBanner,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";

export function AssignDialog({
  workspaceId,
  subjectId,
  protocolId,
  onClose,
  onDone,
}: {
  workspaceId: string;
  /** The person, when assigning from their page. */
  subjectId?: string;
  /** The protocol, when assigning from its page. */
  protocolId?: string;
  onClose: () => void;
  onDone?: (assignment: Assignment) => void;
}) {
  const t = useTranslations("assignments");
  const errorMessage = useErrorMessage();
  const official = useOfficialTexts();
  const queryClient = useQueryClient();
  const [protocol, setProtocol] = useState(protocolId ?? "");
  const [subject, setSubject] = useState(subjectId ?? "");
  const [runs, setRuns] = useState("1");
  const [unlimited, setUnlimited] = useState(false);
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");

  const protocols = useQuery({
    queryKey: ["protocols", "assignable"],
    queryFn: () => api.get<ProtocolCard[]>("protocols?limit=100"),
    enabled: protocolId === undefined,
  });
  const subjects = useSubjects(workspaceId, {
    view: "mine",
    enabled: subjectId === undefined,
  });
  const assign = useMutation({
    mutationFn: () =>
      api.post<Assignment>(`workspaces/${workspaceId}/assignments`, {
        subject_id: subject,
        protocol_id: protocol,
        runs_allowed: unlimited ? null : Number(runs),
        due_at: dueAtFromDate(due),
        note: note.trim() || null,
      } satisfies AssignmentIn),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      onDone?.(created);
      onClose();
    },
  });
  const choices = (protocols.data ?? []).filter(isPlayable);
  const people = (subjects.data ?? []).filter((s) => s.archived_at == null);
  const runsValid = unlimited || (Number(runs) >= 1 && Number(runs) <= 100);

  return (
    <Sheet title={t("dialogTitle")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          assign.mutate();
        }}
      >
        {assign.isError && <ErrorBanner message={errorMessage(assign.error)} />}
        {protocolId === undefined && (
          <Field label={t("protocol")}>
            <Select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
              required
            >
              <option value="">{t("chooseProtocol")}</option>
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {official.card(p).title}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {subjectId === undefined && (
          <Field label={t("subject")}>
            {subjects.isSuccess && people.length === 0 ? (
              <p className="text-[14px] text-ink-3">{t("noSubjects")}</p>
            ) : (
              <Select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              >
                <option value="">{t("chooseSubject")}</option>
                {people.map((s) => (
                  <option key={s.id} value={s.id}>
                    {subjectLabel(s)}
                    {s.display_name ? ` · ${s.code}` : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div className="flex flex-wrap items-end gap-4">
          <Field label={t("runs")} className="w-28">
            <Input
              type="number"
              min={1}
              max={100}
              value={runs}
              disabled={unlimited}
              onChange={(e) => setRuns(e.target.value)}
            />
          </Field>
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={unlimited}
              onChange={(e) => setUnlimited(e.target.checked)}
              className="h-5 w-5 rounded-md accent-(--accent)"
            />
            {t("unlimited")}
          </label>
        </div>
        <Field label={t("due")} hint={t("dueHint")}>
          <Input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </Field>
        <Field label={t("note")} hint={t("noteHint")}>
          <Textarea
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            disabled={!protocol || !subject || !runsValid || assign.isPending}
          >
            {t("submit")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
