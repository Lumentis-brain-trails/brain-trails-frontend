"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Segmented, Skeleton } from "@/components/ui";
import { useOpsEnv } from "@console/components/env";
import type { AppPageProps } from "@console/lib/manifest";
import { type LabForm, defaultForm, fromExperiment } from "./lib/lab";
import { ExperimentForm } from "./sections/ExperimentForm";
import { RunList } from "./sections/RunList";
import { RunView } from "./sections/RunView";

type Tab = "new" | "runs";

/** A run id from the address, or null when it is not one. */
function runParam(value: string | null): string | null {
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

/**
 * The lab's screen: the experiment form or the run list, or one run (`?run=<id>`). The
 * run lives in the address, so a link to a result opens that result; going back
 * returns to the list. "Edit a copy" brings a run's experiment back into the form. A
 * run belongs to the environment it read, so switching the environment drops it from
 * the address (replacing the entry) and shows that environment's runs.
 */
function Lab() {
  const t = useTranslations("console.pipelineLab");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const runId = runParam(search.get("run"));
  const { env } = useOpsEnv();
  const [tab, setTab] = useState<Tab>("new");
  // A new key remounts the form on its new starting values.
  const [start, setStart] = useState<{ key: number; form: LabForm }>({
    key: 0,
    form: defaultForm(),
  });

  const open = useCallback(
    (id: string | null, how: "push" | "replace" = "push") => {
      const params = new URLSearchParams(search.toString());
      params.delete("run");
      if (id) params.set("run", id);
      const query = params.toString();
      router[how](query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, search]
  );

  // A switch away from an open run lands on the new environment's run list.
  const [tabEnv, setTabEnv] = useState(env);
  if (tabEnv !== env) {
    setTabEnv(env);
    if (runId) setTab("runs");
  }
  // The environment comes from the address too, so by the time it changes `search`
  // already holds the new `env`: dropping `run` keeps it.
  const seenEnv = useRef(env);
  useEffect(() => {
    if (seenEnv.current === env) return;
    seenEnv.current = env;
    if (runId) open(null, "replace");
  }, [env, runId, open]);

  if (runId) {
    return (
      <RunView
        key={runId}
        runId={runId}
        onBack={() => {
          setTab("runs");
          open(null);
        }}
        onOpen={open}
        onCopy={(config) => {
          setStart((s) => ({ key: s.key + 1, form: fromExperiment(config) }));
          setTab("new");
          open(null);
        }}
      />
    );
  }
  return (
    <div className="grid gap-6">
      <div className="overflow-x-auto">
        <Segmented
          label={t("sections")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "new", label: t("new") },
            { value: "runs", label: t("runs") },
          ]}
        />
      </div>
      {tab === "new" ? (
        <ExperimentForm
          key={start.key}
          initial={start.form}
          onStarted={(run) => open(run.id)}
        />
      ) : (
        <RunList onOpen={open} />
      )}
    </div>
  );
}

/**
 * Pipeline lab: an EEG analysis experiment on one environment's stored recordings,
 * run in the background by bt-ops and read back as a table and a 2-D map (backend
 * OPS-0006). Phase 1 reuses the stored embeddings; the steps phase 2 opens are shown,
 * as standard, so the pipeline reads whole.
 */
export function PipelineLabApp({ semver }: AppPageProps) {
  const t = useTranslations("console.pipelineLab");
  return (
    <div data-version={semver} className="grid max-w-6xl gap-6">
      <p className="text-ink-2">{t("intro")}</p>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Lab />
      </Suspense>
    </div>
  );
}
