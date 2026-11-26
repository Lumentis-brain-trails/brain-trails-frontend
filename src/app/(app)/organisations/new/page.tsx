"use client";

/**
 * Asking for a clinic, a laboratory or a school (backend V4-0001, sprint T2; V4-0012).
 *
 * A school (flag `schools`) is a teacher's: where it is, the teacher's role and
 * qualification, and two declarations the teacher ticks - that they can verify the
 * consent of their students' guardians, and that their school allows them to present
 * Brain Trails. Those two sentences are the text whose version the backend stores
 * (`TEACHER_ATTESTATION_VERSION`), so their words change only with it.
 *
 * A request waits for a platform admin, as every account did during the beta; nothing
 * can be built in it until then. The page shows the person's own requests under the
 * form, so a request does not disappear into a queue they cannot see. The name is the
 * organisation's own and is shown as typed.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFormatLocale } from "@/i18n/formatLocale";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";
import { useErrorMessage } from "@/lib/errorMessage";
import { useFeature } from "@/lib/features";
import { formatDate } from "@/lib/format";
import {
  type Workspace,
  WORKSPACES_QUERY_KEY,
  useWorkspaces,
} from "@/lib/workspace";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  ListRow,
  SectionTitle,
  Segmented,
} from "@/components/ui";

type Kind = components["schemas"]["WorkspaceRequestIn"]["kind"];

const NO_SCHOOL = {
  city: "",
  country: "",
  teacherRole: "",
  qualification: "",
  attestGuardians: false,
  attestPermission: false,
};

export default function RequestOrganisationPage() {
  const t = useTranslations("organisationRequest");
  const tKinds = useTranslations("workspaces.kinds");
  const errorMessage = useErrorMessage();
  const locale = useFormatLocale();
  const enabled = useFeature("workspaces_multi");
  const schoolsOn = useFeature("schools");
  const queryClient = useQueryClient();
  const workspaces = useWorkspaces();
  const [kind, setKind] = useState<Kind>("practice");
  const [name, setName] = useState("");
  const [school, setSchool] = useState(NO_SCHOOL);
  const isSchool = kind === "school";
  const schoolReady =
    !isSchool ||
    (school.city.trim().length >= 2 &&
      /^[A-Z]{2}$/.test(school.country) &&
      school.teacherRole.trim().length >= 2 &&
      school.qualification.trim().length >= 2 &&
      school.attestGuardians &&
      school.attestPermission);

  const send = useMutation({
    mutationFn: () =>
      api.post<Workspace>("workspaces", {
        kind,
        name: name.trim(),
        ...(isSchool
          ? {
              school: {
                city: school.city.trim(),
                country: school.country,
                teacher_role: school.teacherRole.trim(),
                qualification: school.qualification.trim(),
                attest_guardians: school.attestGuardians,
                attest_permission: school.attestPermission,
              },
            }
          : {}),
      }),
    onSuccess: () => {
      setName("");
      setSchool(NO_SCHOOL);
      queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY });
    },
  });

  if (!enabled) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <EmptyState title={t("unavailable")} />
      </main>
    );
  }

  const requests = (workspaces.data ?? []).filter((w) => w.kind !== "personal");

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <h1 className="type-title">
          {t(schoolsOn ? "titleWithSchool" : "title")}
        </h1>
        <p className="mt-2 text-ink-2">{t("intro")}</p>
      </header>

      <Card>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink-2">
              {t("kind")}
            </p>
            <Segmented
              label={t("kind")}
              size="md"
              value={kind}
              onChange={setKind}
              options={[
                { value: "practice", label: tKinds("practice") },
                { value: "lab", label: tKinds("lab") },
                ...(schoolsOn
                  ? [{ value: "school" as const, label: tKinds("school") }]
                  : []),
              ]}
            />
            <p className="mt-2 text-[13px] text-ink-3">{t(`${kind}Hint`)}</p>
          </div>
          <Field
            label={isSchool ? t("school.name") : t("name")}
            hint={isSchool ? t("school.nameHint") : t("nameHint")}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={200}
              required
            />
          </Field>
          {isSchool && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <Field label={t("school.city")}>
                  <Input
                    value={school.city}
                    maxLength={120}
                    onChange={(e) =>
                      setSchool({ ...school, city: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label={t("school.country")}
                  hint={t("school.countryHint")}
                >
                  <Input
                    value={school.country}
                    maxLength={2}
                    autoCapitalize="characters"
                    onChange={(e) =>
                      setSchool({
                        ...school,
                        country: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </Field>
              </div>
              <Field label={t("school.role")} hint={t("school.roleHint")}>
                <Input
                  value={school.teacherRole}
                  maxLength={200}
                  onChange={(e) =>
                    setSchool({ ...school, teacherRole: e.target.value })
                  }
                />
              </Field>
              <Field
                label={t("school.qualification")}
                hint={t("school.qualificationHint")}
              >
                <Input
                  value={school.qualification}
                  maxLength={200}
                  onChange={(e) =>
                    setSchool({ ...school, qualification: e.target.value })
                  }
                />
              </Field>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={school.attestGuardians}
                  onChange={(e) =>
                    setSchool({ ...school, attestGuardians: e.target.checked })
                  }
                  className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
                />
                <span>{t("school.attestGuardians")}</span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={school.attestPermission}
                  onChange={(e) =>
                    setSchool({ ...school, attestPermission: e.target.checked })
                  }
                  className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
                />
                <span>{t("school.attestPermission")}</span>
              </label>
            </div>
          )}
          {send.isError && <ErrorBanner message={errorMessage(send.error)} />}
          {send.isSuccess && (
            <p role="status" className="text-[14px] text-ok">
              {t("sent")}
            </p>
          )}
          <Button
            type="submit"
            disabled={send.isPending || name.trim().length < 2 || !schoolReady}
          >
            {t("submit")}
          </Button>
        </form>
      </Card>

      <SectionTitle className="mt-10">{t("yours")}</SectionTitle>
      {requests.length === 0 ? (
        <p className="text-ink-3">{t("none")}</p>
      ) : (
        <Card inset>
          {requests.map((w) => (
            <ListRow key={w.id}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{w.name}</span>
                <span className="block text-[13px] text-ink-3">
                  {t("requestedOn", {
                    kind: tKinds(w.kind as Kind),
                    date: formatDate(w.created_at, locale),
                  })}
                </span>
              </span>
              <span className="text-[13px] text-ink-2">
                {t(
                  `status.${w.status as "pending" | "active" | "rejected" | "archived"}`
                )}
              </span>
            </ListRow>
          ))}
        </Card>
      )}
    </main>
  );
}
