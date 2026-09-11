import Link from "next/link";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <p className="type-eyebrow text-ink-3">Privacy note · placeholder</p>
      <h1 className="type-title mt-3">What happens to your data.</h1>
      <div className="type-body-lg mt-8 space-y-6 text-pretty text-ink-2">
        <p>
          Brain Trails is a research prototype by LuMentis. EEG recordings and
          the profile information you provide are processed to compute
          embeddings and visualizations, stored in the EU (databases and object
          storage in Frankfurt), and are visible only to you and to the
          administrators who review registrations.
        </p>
        <p>
          You can export or delete all of your data at any time from your
          account page. Deletion removes your recordings, analyses and stored
          files. This text is a placeholder (v2026-09-06) and will be replaced
          by a reviewed privacy policy before any public launch.
        </p>
      </div>
      <Link
        href="/"
        className="mt-10 inline-block text-[14px] font-medium text-accent hover:underline"
      >
        Back home
      </Link>
    </main>
  );
}
