"use client";

/**
 * Joining a school from the account page: for a student who signed up before they had
 * their teacher's class code. The code is checked as it is typed (`POST
 * /schools/lookup`, the school's name and city), and joining is the student's own
 * consent to the students' privacy note (`POST /schools/me`, backend V4-0012). An adult
 * joins at once; one school per account. Once enrolled the card names the school.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";
import { useAppConfig } from "@/lib/features";
import { type SchoolPreview, isCompleteCode, normalCode } from "@/lib/schools";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  ListRow,
  SectionTitle,
} from "@/components/ui";

interface MyEnrolment {
  school_name: string | null;
  status: string;
}

export const MY_SCHOOL_QUERY_KEY = ["schools", "me"] as const;

export function SchoolCard() {
  const t = useTranslations("schools.join");
  const tSignup = useTranslations("schools.signup");
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const config = useAppConfig();
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);

  const mine = useQuery({
    queryKey: MY_SCHOOL_QUERY_KEY,
    queryFn: () => api.get<MyEnrolment>("schools/me"),
    retry: false,
  });
  const preview = useQuery({
    queryKey: ["school-code", normalCode(code)],
    queryFn: () => api.post<SchoolPreview>("schools/lookup", { code }),
    enabled: isCompleteCode(code),
    retry: false,
    staleTime: 60_000,
  });
  const join = useMutation({
    mutationFn: () =>
      api.post<MyEnrolment>("schools/me", { code, consent: true }),
    onSuccess: (enrolment) => {
      queryClient.setQueryData(MY_SCHOOL_QUERY_KEY, enrolment);
      queryClient.invalidateQueries({ queryKey: ["schools", "me", "game"] });
      setCode("");
      setConsent(false);
    },
  });

  if (mine.isLoading) return null;

  return (
    <>
      <SectionTitle>{t("title")}</SectionTitle>
      {mine.data ? (
        <Card inset>
          <ListRow className="justify-between">
            <span>{t("enrolled", { name: mine.data.school_name ?? "" })}</span>
          </ListRow>
        </Card>
      ) : (
        <Card className="space-y-4">
          <p className="text-pretty text-ink-2">{t("intro")}</p>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (preview.data && consent) join.mutate();
            }}
          >
            <Field label={tSignup("code")}>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={20}
              />
            </Field>
            {preview.data && (
              <p className="text-sm text-ok">
                {tSignup("found", {
                  name: preview.data.name,
                  city: preview.data.city,
                })}
              </p>
            )}
            {preview.isError && (
              <ErrorBanner message={errorMessage(preview.error)} />
            )}
            {preview.data && (
              <>
                {config.data?.school_consent_version && (
                  <p className="text-[13px] text-ink-3">
                    {tSignup("version", {
                      version: config.data.school_consent_version,
                    })}
                  </p>
                )}
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded-md accent-(--accent)"
                  />
                  <span>
                    {t.rich("tick", {
                      link: (chunks) => (
                        <Link
                          className="font-semibold text-ink hover:underline"
                          href="/privacy?in=tab"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {chunks}
                        </Link>
                      ),
                    })}
                  </span>
                </label>
              </>
            )}
            {join.isError && <ErrorBanner message={errorMessage(join.error)} />}
            <Button
              type="submit"
              disabled={!preview.data || !consent || join.isPending}
            >
              {t("submit")}
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}
