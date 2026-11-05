/**
 * The therapy edition (backend `app/therapy.py`, V4-0006, sprint T6): a patient's
 * timeline, their landscape with every trail, what they may see of their results, the
 * sessions waiting for review, and the patient's own after-session summaries.
 *
 * The named measures are the backend's registry (QUESTIONS C1, option B); this module
 * only says how to read each one: its label comes from `therapy.metrics.<metric>` and
 * `therapy.families.<family>`, its number from `formatMeasure`.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { components } from "@/lib/api-types";

export type Timeline = components["schemas"]["TimelineOut"];
export type TimelineSession = components["schemas"]["TimelineSessionOut"];
export type Measure = components["schemas"]["MeasureOut"];
export type Change = components["schemas"]["ChangeOut"];
export type ReviewItem = components["schemas"]["ReviewItemOut"];
export type SubjectLandscape = components["schemas"]["SubjectLandscapeOut"];
export type Summary = components["schemas"]["SummaryOut"];
export type ShareLevel = "nothing" | "summary" | "full";

export const SHARE_LEVELS: ShareLevel[] = ["nothing", "summary", "full"];

export function useTimeline(subjectId: string, enabled = true, weeks = 8) {
  return useQuery({
    queryKey: ["timeline", subjectId, weeks],
    queryFn: () =>
      api.get<Timeline>(`subjects/${subjectId}/timeline?weeks=${weeks}`),
    enabled,
  });
}

export function useSubjectLandscape(subjectId: string, enabled = true) {
  return useQuery({
    queryKey: ["subject-landscape", subjectId],
    queryFn: () => api.get<SubjectLandscape>(`subjects/${subjectId}/landscape`),
    enabled,
    retry: false,
  });
}

export function useShare(subjectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (level: ShareLevel) =>
      api.put<{ share_results: ShareLevel }>(`subjects/${subjectId}/share`, {
        level,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["timeline", subjectId] });
      void queryClient.invalidateQueries({ queryKey: ["subject", subjectId] });
    },
  });
}

export function useReviewQueue(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["review", workspaceId],
    queryFn: () => api.get<ReviewItem[]>(`workspaces/${workspaceId}/review`),
    enabled: workspaceId !== undefined,
  });
}

export function useMySummaries(enabled = true) {
  return useQuery({
    queryKey: ["me", "summaries"],
    queryFn: () => api.get<Summary[]>("me/summaries?limit=10"),
    enabled,
  });
}

/** A measure's value for a reader: units and rounding by what it is. */
export function formatMeasure(metric: string, value: number): string {
  switch (metric) {
    case "rt_median_ms":
      return `${Math.round(value)} ms`;
    case "rt_cv":
    case "accuracy":
    case "alpha_relative":
      return `${Math.round(value * 100)}%`;
    case "d_prime":
      return value.toFixed(2);
    case "good_minutes":
      return `${value.toFixed(1)} min`;
    case "throughput_per_min":
      return `${value.toFixed(1)}/min`;
    default:
      return String(Math.round(value * 100) / 100);
  }
}
