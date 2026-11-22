/** The backend's `beta-testers.pending` panel, as stored in its snapshot. */
export interface PendingPayload {
  /** Applications nobody has answered yet. */
  pending: number;
  by_decision: Record<string, number>;
  /** Of the pending ones, those who ticked "I want the beta" (the stand's marker). */
  pending_wants_beta: number;
  oldest_pending_at: string | null;
  /** Clinic and laboratory requests waiting for a decision. */
  organisations_pending: number;
}
