/**
 * Fair mode, as the backend reports it (`GET /fair`, ADR V3-0013).
 *
 * A switch an admin flips while a stand is open, so it is read from the server and never
 * guessed here. `false` while loading or when the request failed: an unknown state must
 * hide the question, never ask it - a tick offered outside a fair promises a headband
 * nobody is holding.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface FairState {
  open: boolean;
}

export function useFairOpen(): boolean {
  const query = useQuery({
    queryKey: ["fair"],
    queryFn: () => api.get<FairState>("fair"),
    // Short, not Infinity: a stand opens and closes in the middle of a day, and a form
    // left open in a tab should catch up rather than keep asking after we have closed.
    staleTime: 60_000,
    retry: 1,
  });
  return query.data?.open === true;
}
