import { redirect } from "next/navigation";

/** NeuroMetrics moved into the recording page's rows; kept for old links. */
export default async function NeuroMetricsRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/recordings/${id}`);
}
