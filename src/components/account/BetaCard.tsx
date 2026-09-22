"use client";

/**
 * The beta programme, from the account page (V3-0008, amended).
 *
 * Registration asks only whether someone wants in and roughly what for; the credentials
 * the board actually selects on - a therapist's registration number, a lab's institution
 * and supervisor - are answered here, at leisure, and validated here too. The decision
 * columns are the board's: this form never touches them, and the card shows where the
 * answer got to rather than pretending it is still open.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiRequestError, api } from "@/lib/api";
import type { ApplicationForm } from "@/lib/application";
import { toApplicationPayload } from "@/lib/application";
import { useTaxonomies, labelFor } from "@/lib/taxonomies";
import { ApplicationStep } from "@/components/application/ApplicationStep";
import { ListField } from "@/components/form/ListField";
import { useToast } from "@/components/Toast";
import {
  Button,
  Card,
  ErrorBanner,
  KeyValue,
  SectionTitle,
} from "@/components/ui";

/** `GET /auth/me/application`: the answers plus where the board got to. */
export interface ApplicationData extends Record<string, unknown> {
  decision: string;
  wants_beta: boolean;
  intended_use: string | null;
  intended_use_other: string | null;
}

const DECISIONS: Record<string, string> = {
  pending: "We have your answers. Nothing to do.",
  accepted: "You are in the beta.",
  waitlisted: "On the waiting list - we write as soon as there is room.",
  rejected: "Not this round.",
};

/** Form values from the stored row; empty strings where nothing was answered. */
function toForm(data: ApplicationData): ApplicationForm {
  const text = (key: string) =>
    data[key] == null ? "" : String(data[key] as string);
  return {
    requested_profile: (text("requested_profile") ||
      "private") as ApplicationForm["requested_profile"],
    organisation: text("organisation"),
    role_title: text("role_title"),
    registration_no: text("registration_no"),
    institution: text("institution"),
    supervisor: text("supervisor"),
    purpose: text("purpose"),
    headband: (text("headband") || "muse-2") as ApplicationForm["headband"],
    device: text("device"),
    browser: text("browser"),
    web_bluetooth: data.web_bluetooth as boolean | undefined,
    country: text("country"),
    language: text("language"),
    expected_subjects: data.expected_subjects as number | undefined,
    contact_ok: Boolean(data.contact_ok),
  };
}

export function BetaCard({ data }: { data: ApplicationData | undefined }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const lists = useTaxonomies();
  const [editing, setEditing] = useState(false);
  const [wantsBeta, setWantsBeta] = useState(data?.wants_beta ?? false);
  const [use, setUse] = useState(data?.intended_use ?? "");
  const [useOther, setUseOther] = useState(data?.intended_use_other ?? "");

  const save = useMutation({
    mutationFn: (values: ApplicationForm) =>
      api.put("auth/me/application", {
        ...toApplicationPayload(values),
        wants_beta: wantsBeta,
        intended_use: wantsBeta && use ? use : null,
        intended_use_other: wantsBeta && useOther ? useOther : null,
      }),
    onSuccess: async () => {
      toast("success", "Saved.");
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["me-application"] });
    },
  });

  if (!data) return null;

  return (
    <Card>
      <SectionTitle>Beta programme</SectionTitle>
      <p className="mt-2 text-pretty text-ink-2">
        {data.wants_beta
          ? (DECISIONS[data.decision] ?? DECISIONS.pending)
          : "You are not on the list. Tick the box below if you change your mind."}
      </p>
      {save.error && (
        <div className="mt-4">
          <ErrorBanner
            message={
              save.error instanceof ApiRequestError
                ? save.error.error.message
                : "Could not save."
            }
          />
        </div>
      )}

      <div className="mt-6 space-y-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
            checked={wantsBeta}
            onChange={(e) => {
              setWantsBeta(e.target.checked);
              setEditing(true);
            }}
          />
          <span>I would like to be a beta tester.</span>
        </label>

        {wantsBeta && !editing && (
          <KeyValue
            label="How you expect to use it"
            value={
              data.intended_use
                ? data.intended_use === "other"
                  ? (data.intended_use_other ?? "Other")
                  : labelFor(data.intended_use)
                : "Not said"
            }
          />
        )}

        {wantsBeta && editing && (
          <ListField
            label="How do you expect to use it?"
            options={lists.data?.intended_use}
            value={use}
            field={{
              value: use,
              onChange: (e) => setUse(e.target.value),
            }}
            otherField={{
              value: useOther,
              onChange: (e) => setUseOther(e.target.value),
            }}
            placeholder="Not sure yet"
          />
        )}
      </div>

      {editing ? (
        <div className="mt-6">
          <ApplicationStep
            initial={toForm(data)}
            onDone={(values) => save.mutate(values)}
            submitLabel={save.isPending ? "Saving…" : "Save"}
            busy={save.isPending}
          />
          <div className="mt-3">
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {data.wants_beta ? "Edit your answers" : "Answer the questions"}
          </Button>
        </div>
      )}
    </Card>
  );
}
