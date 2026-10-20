/**
 * Signing out, and in: the query cache goes with the account.
 *
 * Every answer the app fetched lives in React Query's cache for a while (`["me"]` for a
 * minute). On a shared computer - a clinic's tablet, a family laptop - the next person to
 * sign in must not see the previous one's patients, sessions or name even for a moment,
 * so the cache is emptied whenever the account changes: at sign-out, and at sign-in in
 * case the previous session simply expired.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { api } from "@/lib/api";

/**
 * `signOut(to)`: end the session, forget every cached answer, go to `to`.
 *
 * The cache is emptied and the page left even when the sign-out call fails (its error
 * still reaches the caller): what was on screen must not outlive the attempt to leave.
 */
export function useSignOut(): (to?: string) => Promise<void> {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useCallback(
    async (to = "/login") => {
      try {
        await api.logout();
      } finally {
        queryClient.clear();
        router.push(to);
      }
    },
    [queryClient, router]
  );
}
