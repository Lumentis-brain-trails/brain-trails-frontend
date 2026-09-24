"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  type Focus,
  type Selection,
  selectionQuery,
} from "@/lib/compare/selection";

/** How long a focus must stay still before it is asked for: a drag is not a request. */
const SETTLE_MS = 250;

/**
 * A column's metrics for its focus, recomputed by the backend (backend V3-0017).
 *
 * The request waits until the focus stops moving, and the previous answer stays on
 * screen meanwhile - but only for the same block: another block's numbers are never
 * shown under this one's name. Every block is asked for, even unfocused, because the
 * stored rows of an older recording have no labels or dynamics and this has both.
 */
export function useSelection(
  recordingId: string,
  blockKey: string | undefined,
  focus: Focus
) {
  const query = blockKey ? selectionQuery(blockKey, focus) : null;
  const [settled, setSettled] = useState(query);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(query), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  return useQuery({
    queryKey: ["selection", recordingId, settled],
    queryFn: () =>
      api.get<Selection>(`recordings/${recordingId}/selection?${settled}`),
    enabled: Boolean(settled),
    retry: false,
    staleTime: Infinity,
    placeholderData: (previous) =>
      previous && previous.block_key === blockKey ? previous : undefined,
  });
}
