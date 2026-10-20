"use client";

/**
 * The beta selection board (backend V3-0008, sprint S15).
 *
 * Registration is an application; this page is where the sample is chosen. It lists
 * applications by decision, filters by requested profile and cohort, shows what matters
 * for the choice first - profile, credentials, headband, browser and whether it can
 * pair over Bluetooth - and decides in one gesture: accept, waitlist or reject, with a
 * cohort and a private note. Cohorts sit above the list with their targets, so the
 * sample is built on purpose.
 *
 * What an applicant typed is shown as stored; what is a code with a closed set
 * (profile, decision, headband) is shown in the reader's words, the headband in the
 * very words of the form the applicant chose from (`application.headband`).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFormatLocale } from "@/i18n/formatLocale";
import { ApiRequestError, api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { useErrorMessage } from "@/lib/errorMessage";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Icon,
  Input,
  Segmented,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui";

type BoardRow = components["schemas"]["BoardRow"];
type ApprovalOut = components["schemas"]["ApprovalOut"];
type Cohort = components["schemas"]["CohortOut"];
type Decision = components["schemas"]["DecideIn"]["decision"];
type BetaProfile = components["schemas"]["BetaProfile"];

const TABS = ["pending", "waitlisted", "accepted", "rejected"] as const;
type Tab = (typeof TABS)[number];

const PROFILES: BetaProfile[] = [
  "private",
  "therapist",
  "lab_lead",
  "lab_member",
];

/**
 * The words for a requested profile (`admin.applications.profiles`), or the code itself
 * for one the catalogue has not learnt yet.
 */
function useProfileLabel(): (profile: string) => string {
  const t = useTranslations("admin.applications.profiles");
  return (profile) => (t.has(profile as never) ? t(profile as never) : profile);
}

/**
 * The answers shown on a card, in order, and whose label each one takes: the
 * application form's own (`form`, `application.<field>`) where that is already a short
 * name, the board's (`board`, `admin.applications.answers.labels.<field>`) where the
 * form asks a whole question.
 */
const ANSWERS = [
  ["organisation", "form"],
  ["role_title", "form"],
  ["registration_no", "board"],
  ["institution", "form"],
  ["supervisor", "form"],
  ["headband", "board"],
  ["device", "board"],
  ["browser", "form"],
  ["country", "form"],
  ["language", "form"],
  ["expected_subjects", "board"],
] as const satisfies readonly (readonly [
  keyof BoardRow["application"],
  "form" | "board",
])[];

function Answers({ application }: { application: BoardRow["application"] }) {
  const t = useTranslations("admin.applications.answers");
  const tForm = useTranslations("application");
  const rows = ANSWERS.filter(
    ([key]) => application[key] !== null && application[key] !== ""
  );
  const value = (key: (typeof ANSWERS)[number][0]) => {
    const stored = String(application[key]);
    const headband = `headband.${stored}`;
    return key === "headband" && tForm.has(headband as never)
      ? tForm(headband as never)
      : stored;
  };
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
      {rows.map((row) => (
        <div key={row[0]} className="min-w-0">
          <dt className="type-caption text-ink-3">
            {row[1] === "form" ? tForm(row[0]) : t(`labels.${row[0]}`)}
          </dt>
          <dd className="truncate text-[14px]">{value(row[0])}</dd>
        </div>
      ))}
      <div className="min-w-0">
        <dt className="type-caption text-ink-3">{t("webBluetooth")}</dt>
        <dd className="text-[14px]">
          {application.web_bluetooth === null
            ? t("bluetoothUnknown")
            : application.web_bluetooth
              ? t("bluetoothYes")
              : t("bluetoothNo")}
        </dd>
      </div>
    </dl>
  );
}

function VerificationLink({ url }: { url: string }) {
  const t = useTranslations("admin.applications.verification");
  const [copied, setCopied] = useState(false);
  return (
    <div className="enter-up mt-4 rounded-[var(--radius-control)] bg-warn-soft p-4">
      <p className="type-caption mb-2 font-medium text-warn">{t("manual")}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto font-mono text-[12px] whitespace-nowrap text-ink">
          {url}
        </code>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          <Icon name={copied ? "check" : "copy"} className="h-3.5 w-3.5" />
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
    </div>
  );
}

function Cohorts({ cohorts }: { cohorts: Cohort[] }) {
  const t = useTranslations("admin.applications");
  const profileLabel = useProfileLabel();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [profile, setProfile] = useState<BetaProfile | "">("");
  const [target, setTarget] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api.post<Cohort>("admin/cohorts", {
        name,
        profile: profile || null,
        target: target ? Number(target) : null,
      }),
    onSuccess: () => {
      setName("");
      setTarget("");
      queryClient.invalidateQueries({ queryKey: ["cohorts"] });
    },
  });
  return (
    <Card>
      <p className="type-subhead mb-4">{t("cohorts.title")}</p>
      {cohorts.length === 0 && (
        <p className="mb-4 text-ink-3">{t("cohorts.empty")}</p>
      )}
      <ul className="mb-5 space-y-2">
        {cohorts.map((c) => (
          <li key={c.id} className="flex items-baseline justify-between gap-4">
            <span className="truncate">
              {c.name}
              {c.profile && (
                <span className="type-caption ml-2 text-ink-3">
                  {profileLabel(c.profile)}
                </span>
              )}
            </span>
            <span className="type-caption shrink-0 text-ink-2 tabular-nums">
              {t("cohorts.counts", {
                accepted: c.counts.accepted ?? 0,
                hasTarget: c.target !== null ? "yes" : "no",
                target: c.target ?? "",
                waitlisted: c.counts.waitlisted ?? 0,
              })}
            </span>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <Field label={t("cohorts.new")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("profile")}>
          <Select
            value={profile}
            onChange={(e) => setProfile(e.target.value as BetaProfile | "")}
          >
            <option value="">{t("cohorts.anyProfile")}</option>
            {PROFILES.map((value) => (
              <option key={value} value={value}>
                {profileLabel(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("cohorts.target")}>
          <Input
            type="number"
            inputMode="numeric"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-24"
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={create.isPending}>
          {t("cohorts.add")}
        </Button>
      </form>
      {create.error instanceof ApiRequestError && (
        <div className="mt-3">
          <ErrorBanner message={errorMessage(create.error)} />
        </div>
      )}
    </Card>
  );
}

function Decide({
  row,
  cohorts,
  onDecided,
  onError,
}: {
  row: BoardRow;
  cohorts: Cohort[];
  onDecided: (data: ApprovalOut) => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations("admin.applications");
  const errorMessage = useErrorMessage();
  const [cohort, setCohort] = useState(row.cohort?.id ?? "");
  const [note, setNote] = useState(row.application.admin_note ?? "");
  const decide = useMutation({
    mutationFn: (decision: Decision) =>
      api.post<ApprovalOut>(`admin/applications/${row.user.id}/decide`, {
        decision,
        cohort_id: cohort || null,
        note: note || null,
      }),
    onSuccess: onDecided,
    onError: (e) => onError(errorMessage(e)),
  });
  const current = row.application.decision;
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_2fr]">
      <Field label={t("cohort")}>
        <Select value={cohort} onChange={(e) => setCohort(e.target.value)}>
          <option value="">{t("decide.noCohort")}</option>
          {cohorts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("decide.note")}>
        <Textarea
          rows={1}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button
          onClick={() => decide.mutate("accept")}
          disabled={decide.isPending}
        >
          {t("decide.accept")}
        </Button>
        {current !== "waitlisted" && (
          <Button
            variant="secondary"
            onClick={() => decide.mutate("waitlist")}
            disabled={decide.isPending}
          >
            {t("decide.waitlist")}
          </Button>
        )}
        {current !== "rejected" && (
          <Button
            variant="danger"
            onClick={() => decide.mutate("reject")}
            disabled={decide.isPending}
          >
            {t("decide.reject")}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AdminApplicationsPage() {
  const t = useTranslations("admin.applications");
  const profileLabel = useProfileLabel();
  const errorMessage = useErrorMessage();
  const locale = useFormatLocale();
  const [tab, setTab] = useState<Tab>("pending");
  const [profile, setProfile] = useState<BetaProfile | "">("");
  const [cohort, setCohort] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const params = new URLSearchParams({ decision: tab, limit: "200" });
  if (profile) params.set("profile", profile);
  if (cohort) params.set("cohort", cohort);
  const board = useQuery({
    queryKey: ["applications", params.toString()],
    queryFn: () => api.get<BoardRow[]>(`admin/applications?${params}`),
    retry: false,
  });
  const cohorts = useQuery({
    queryKey: ["cohorts"],
    queryFn: () => api.get<Cohort[]>("admin/cohorts"),
    retry: false,
  });

  const decided = (data: ApprovalOut) => {
    setError(null);
    if (data.verification_url) {
      setLinks((prev) => ({ ...prev, [data.user.id]: data.verification_url! }));
    }
    queryClient.invalidateQueries({ queryKey: ["applications"] });
    queryClient.invalidateQueries({ queryKey: ["cohorts"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
  };
  const reissue = useMutation({
    mutationFn: (userId: string) =>
      api.post<ApprovalOut>(
        `admin/applications/${userId}/reissue-verification`
      ),
    onSuccess: decided,
    onError: (e) => setError(errorMessage(e)),
  });

  const forbidden =
    board.error instanceof ApiRequestError && board.error.status === 403;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">{t("title")}</h1>
          <p className="mt-1 text-ink-2">{t("intro")}</p>
        </div>
        <Segmented
          label={t("decision")}
          size="md"
          value={tab}
          onChange={setTab}
          options={TABS.map((value) => ({
            value,
            label: t(`tabs.${value}`),
          }))}
        />
      </header>

      {forbidden ? (
        <ErrorBanner message={t("forbidden")} />
      ) : (
        <div className="space-y-6">
          <Cohorts cohorts={cohorts.data ?? []} />

          <div className="flex flex-wrap gap-3">
            <Field label={t("profile")}>
              <Select
                value={profile}
                onChange={(e) => setProfile(e.target.value as BetaProfile | "")}
              >
                <option value="">{t("allProfiles")}</option>
                {PROFILES.map((value) => (
                  <option key={value} value={value}>
                    {profileLabel(value)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("cohort")}>
              <Select
                value={cohort}
                onChange={(e) => setCohort(e.target.value)}
              >
                <option value="">{t("allCohorts")}</option>
                {(cohorts.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {error && <ErrorBanner message={error} />}
          {board.isPending && (
            <div className="space-y-3">
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          )}
          {board.data?.length === 0 && (
            <Card inset>
              <EmptyState title={t(`empty.${tab}`)} />
            </Card>
          )}
          <div className="stagger space-y-4">
            {board.data?.map((row) => (
              <Card key={row.user.id}>
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="type-subhead truncate">
                      {row.profile?.full_name ?? row.user.email}
                    </p>
                    <p className="type-caption mt-0.5 text-ink-3">
                      {t("meta", {
                        profile: profileLabel(
                          row.application.requested_profile
                        ),
                        email: row.user.email,
                        date: new Date(
                          row.application.created_at
                        ).toLocaleString(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                        inCohort: row.cohort ? "yes" : "no",
                        cohort: row.cohort?.name ?? "",
                      })}
                    </p>
                  </div>
                  <StatusBadge status={row.user.status} />
                </div>
                {row.application.purpose && (
                  <p className="mb-5 text-pretty text-ink-2">
                    {row.application.purpose}
                  </p>
                )}
                <Answers application={row.application} />
                {row.application.decision !== "accepted" && (
                  <Decide
                    row={row}
                    cohorts={cohorts.data ?? []}
                    onDecided={decided}
                    onError={setError}
                  />
                )}
                {row.user.status === "approved" && !links[row.user.id] && (
                  <div className="mt-5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => reissue.mutate(row.user.id)}
                      disabled={reissue.isPending}
                    >
                      {t("verification.reissue")}
                    </Button>
                  </div>
                )}
                {links[row.user.id] && (
                  <VerificationLink url={links[row.user.id]} />
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
