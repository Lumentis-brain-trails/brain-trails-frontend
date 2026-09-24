import { redirect } from "next/navigation";

/** The review became the recording page's comparison view; kept for old links. */
export default async function ReviewRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/recordings/${id}`);
}
