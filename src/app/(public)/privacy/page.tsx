import Link from "next/link";
import { Card } from "@/components/ui";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl p-6 py-16">
      <Card className="space-y-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
          Privacy note (placeholder, v2026-09-06)
        </h1>
        <p>
          Brain Trails is a research prototype by LuMentis. EEG recordings and
          the profile information you provide are processed to compute
          embeddings and visualizations, stored in the EU (databases and object
          storage in Frankfurt), and are visible only to you and to the
          administrators who review registrations.
        </p>
        <p>
          You can request export or deletion of all your data at any time.
          Deletion removes your recordings, analyses and stored files. This text
          is a placeholder and will be replaced by a reviewed privacy policy
          before any public launch.
        </p>
        <Link href="/" className="text-indigo-600 hover:underline">
          Back home
        </Link>
      </Card>
    </main>
  );
}
