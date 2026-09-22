import Link from "next/link";

export const metadata = { title: "Privacy" };

/** Must match `CONSENT_VERSION` on the API: it is the string stored against each account. */
const VERSION = "2026-09-22.v1";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="type-heading">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <p className="type-eyebrow text-ink-3">Privacy note · {VERSION}</p>
      <h1 className="type-title mt-3">What happens to your data.</h1>
      <div className="type-body-lg mt-8 space-y-10 text-pretty text-ink-2">
        <p>
          Brain Trails is a research prototype by LuMentis. It is not a medical
          device: it does not diagnose, treat or screen for anything, and
          nothing it shows you is a clinical result. This note says what we
          collect, why, where it lives and how you get rid of it.
        </p>

        <Section title="What we collect">
          <p>
            <strong className="text-ink">Your account.</strong> Your email
            address and a password, which we store only as a hash and can never
            read back.
          </p>
          <p>
            <strong className="text-ink">Your profile.</strong> Name, year of
            birth, sex at birth and handedness — the four an EEG cannot be
            interpreted without. Anything else on the account page (education,
            occupation, sleep, caffeine, medication, and so on) is optional, and
            blank is a complete answer.
          </p>
          <p>
            <strong className="text-ink">Your recordings.</strong> The brain
            signal from your headband, together with what its other sensors send
            (movement and pulse), the raw stream as the device produced it, and
            the timeline of what you saw and did during a session, including
            your answers and reaction times.
          </p>
          <p>
            <strong className="text-ink">What you upload</strong> to your own
            media library, and{" "}
            <strong className="text-ink">what you tell us</strong> if you ask to
            join the beta programme.
          </p>
          <p>
            We do not use advertising or analytics trackers, and we do not sell
            or share your data with anyone for their own purposes.
          </p>
        </Section>

        <Section title="Why we may hold it">
          <p>
            Because you agreed to it. Brain signals and health-related answers
            are sensitive data, so consent is the only ground we rely on, and
            you can withdraw it at any moment by deleting your account. That
            costs you nothing and we will not ask you why.
          </p>
        </Section>

        <Section title="What we do with it">
          <p>
            We clean the signal, turn it into embeddings, and draw the trail and
            the measurements you see on your session pages. This runs on our own
            machines — your recordings are not sent to any outside AI service.
          </p>
          <p>
            Aggregate, non-identifying figures (how many sessions, how long, how
            often the signal was usable) help us tell whether the product works.
          </p>
        </Section>

        <Section title="Where it lives, and who can see it">
          <p>
            Everything is stored in the European Union, in Frankfurt: the
            database and the file storage both. The site itself is served by
            Vercel and our emails are sent through Resend; both may see the
            technical data any website and any email needs (your address, an IP
            address, a timestamp).
          </p>
          <p>
            Your recordings are visible to you. LuMentis administrators can
            reach accounts and support requests, and during the beta they review
            anything a person asks to publish to other users. Nothing you record
            becomes visible to other people unless you publish it yourself.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            Until you delete it. When you delete something — a recording, or
            your whole account — it disappears from the app at once; backup
            copies in the file storage are cleared within 30 days.
          </p>
          <p>
            While this is a prototype we sometimes rebuild an environment from
            scratch, and recordings made before such a reset are not carried
            over. We will say so in the app before it stops being true.
          </p>
        </Section>

        <Section title="What you can do">
          <p>
            From your account page you can{" "}
            <strong className="text-ink">export everything</strong> we hold
            about you as a single file, and{" "}
            <strong className="text-ink">delete your account</strong>, which
            removes your recordings, your analyses and your stored files. You
            can also ask us to correct something, or object to a use you are not
            comfortable with, by writing to the address below.
          </p>
          <p>
            If you think we have mishandled your data you can complain to your
            national data protection authority.
          </p>
        </Section>

        <Section title="Who to write to">
          <p>
            LuMentis —{" "}
            <a
              className="font-semibold text-ink hover:underline"
              href="mailto:alessio@lumentis.ca"
            >
              alessio@lumentis.ca
            </a>
            . We answer within 30 days.
          </p>
        </Section>

        <p className="type-caption text-ink-3">
          Version {VERSION}. When we change anything that matters here, we ask
          you to agree again rather than changing it quietly — the version you
          accepted is stored with your account.
        </p>
      </div>
      <Link
        href="/"
        className="mt-10 inline-block text-[14px] font-semibold text-ink hover:underline"
      >
        Back home
      </Link>
    </main>
  );
}
