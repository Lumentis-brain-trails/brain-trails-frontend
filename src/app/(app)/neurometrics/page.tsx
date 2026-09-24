import { redirect } from "next/navigation";

/** NeuroMetrics is read on each recording's page now; kept for old links. */
export default function NeuroMetricsListRedirect() {
  redirect("/recordings");
}
