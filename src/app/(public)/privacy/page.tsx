import { BackLink } from "@/components/BackLink";
import { CloseTabButton } from "@/components/CloseTabButton";

export const metadata = { title: "Privacy" };

const EXIT_CLASS =
  "mt-10 inline-block text-[14px] font-semibold text-ink hover:underline";

/**
 * `?in=tab` is set by the links that open the note in a tab of its own, today the
 * sign-up consent step. It decides the exit control and nothing else: a tab that
 * was opened to show this one page is closed, not navigated back out of.
 */
export default async function PrivacyPage({
  searchParams,
}: PageProps<"/privacy">) {
  const inOwnTab = (await searchParams).in === "tab";
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
      {inOwnTab ? (
        <CloseTabButton className={EXIT_CLASS} />
      ) : (
        <BackLink className={EXIT_CLASS} />
      )}
    </main>
  );
}
