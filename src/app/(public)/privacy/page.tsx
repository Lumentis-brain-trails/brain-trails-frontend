import { BackLink } from "@/components/BackLink";
import { CloseTabButton } from "@/components/CloseTabButton";

export const metadata = { title: "Privacy" };

const EXIT_CLASS =
  "mt-10 inline-block text-[14px] font-semibold text-ink hover:underline";

/**
 * The version this text is published under. It must match `CONSENT_VERSION` in the
 * backend, which is what gets written against an account when somebody agrees. Two
 * places, changed together: a demo does not need a sync mechanism, it needs the string
 * to name a text that exists.
 *
 * This file is that text. There is no second copy kept beside it on purpose - the record
 * of what somebody agreed to is this component's history in git, and a duplicate that can
 * drift from what is actually served would be worse than no duplicate at all.
 */
const POLICY_VERSION = "2026-09-22";

const PRIVACY_EMAIL = "privacy@lumentis.ca";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="type-heading text-[19px]">{title}</h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

/**
 * `?in=tab` is set by the links that open the note in a tab of its own, today the
 * sign-up consent step and the account page. It decides the exit control and nothing
 * else: a tab that was opened to show this one page is closed, not navigated back out of.
 */
export default async function PrivacyPage({
  searchParams,
}: PageProps<"/privacy">) {
  const inOwnTab = (await searchParams).in === "tab";
  return (
    <main className="type-body mx-auto w-full max-w-2xl px-6 py-16 text-pretty text-ink-2">
      <p className="type-eyebrow text-ink-3">
        Privacy note · v{POLICY_VERSION}
      </p>
      <h1 className="type-title mt-3 text-ink">What happens to your data.</h1>

      <div className="mt-8 rounded-[var(--radius-card)] bg-surface-2 p-5">
        <p>
          <strong className="text-ink">
            Brain Trails is a non-clinical research prototype, and this note is
            a draft published pending legal review.
          </strong>{" "}
          It describes what the system actually does today. It will be replaced
          by a reviewed policy, and we will tell you when that happens.
        </p>
      </div>

      <p className="mt-6">
        Protecting the privacy of the people who use Brain Trails matters to us
        more than anything else we do with this prototype — we are asking you
        for recordings of your brain, and we do not take that lightly. We are
        making every effort to keep your data secure and to bring this note
        fully in line with the law that applies to it. We have tried hard to
        describe only what is true today rather than what we intend to build,
        and where something is not built yet, this note says so.
      </p>

      <Section title="1. What Brain Trails is, and is not">
        <p>
          Brain Trails is provided for informational and wellness purposes.
          Unless Lumentis Analytics Inc. says otherwise in writing, it is not a
          medical device and is not intended to diagnose, treat, cure, prevent
          or monitor any disease or medical condition. It does not provide
          medical advice.
        </p>
        <p>
          Do not make medical decisions based on it. Talk to a qualified
          health-care professional about symptoms, diagnosis or treatment.
        </p>
      </Section>

      <Section title="2. Who we are">
        <p>
          Lumentis Analytics Inc. is responsible for the personal information
          processed through Brain Trails.
        </p>
        <p>
          Lumentis Analytics Inc., Attn: Privacy Officer
          <br />
          329 Howe Street, Unit 272, Vancouver, British Columbia V6C 3N2, Canada
          <br />
          <a
            href={`mailto:${PRIVACY_EMAIL}`}
            className="font-semibold text-ink hover:underline"
          >
            {PRIVACY_EMAIL}
          </a>
        </p>
      </Section>

      <Section title="3. What we collect">
        <p>
          <strong className="text-ink">Your account.</strong> Your email
          address, your password (stored only as a hash, never as text we can
          read), and an account identifier we generate.
        </p>
        <p>
          <strong className="text-ink">What you tell us about yourself.</strong>{" "}
          Your name, year of birth and handedness, and — if you choose to give
          them — details such as sex at birth, sleep, caffeine, medications, and
          neurological or psychiatric conditions. Several of these are
          health-related and sensitive. Only the few that make a recording
          interpretable are required, none of them at sign-up, and the rest are
          offered and never demanded.
        </p>
        <p>
          <strong className="text-ink">Your recordings.</strong> The EEG
          captured during a session, signal-quality and device information, your
          responses and timings during an exercise, and everything derived from
          them: features, metrics, projections, visualisations and reports.
        </p>
        <p>
          EEG recordings and what we derive from them may be sensitive personal
          information. Depending on the context they may be treated as
          health-related or biometric information.
        </p>
        <p>
          <strong className="text-ink">Technical information.</strong> Ordinary
          server logs, browser and device type, IP address, and the session
          cookie that keeps you signed in.
        </p>
      </Section>

      <Section title="4. What we do with it">
        <p>
          We use it to run the service: to keep your account, to receive and
          process your recordings, to compute the analyses and reports you asked
          for, to show you your history, to keep the service secure and working,
          and to answer you when you write to us.
        </p>
        <p>
          <strong className="text-ink">Improving Brain Trails itself.</strong>{" "}
          We use recordings and derived data to check and improve the accuracy
          and reliability of what Brain Trails does — whether a reading is
          sound, whether a metric behaves, why something failed. This is part of
          running the service you are using.
        </p>
        <p>
          <strong className="text-ink">
            Broader research — only if you say yes.
          </strong>{" "}
          Separately, and only with the optional consent you can give at sign-up
          and change at any time on your account page, we may keep and use your
          pseudonymised recordings and derived data for scientific research
          going beyond running and improving this service. Saying no changes
          nothing about your account, your recordings or your results. If you
          withdraw, we stop using your data for research from that point; we
          cannot undo research already done, or recover data that has been
          irreversibly anonymised.
        </p>
        <p>
          We do not sell your personal information, your recordings or anything
          derived from them, and we do not use them for advertising or
          behavioural tracking of any kind.
        </p>
      </Section>

      <Section title="5. Consent">
        <p>
          We ask for two things separately. The first is consent to process your
          recordings and account data in order to provide Brain Trails at all —
          without it there is no service to give you. The second is the optional
          research consent above.
        </p>
        <p>
          You can withdraw the optional one at any time from your account page.
          You can withdraw the first by deleting your account, also from your
          account page, or by writing to us. Withdrawing does not undo
          processing already carried out.
        </p>
      </Section>

      <Section title="6. Pseudonymised is not anonymous">
        <p>
          Your recordings and everything derived from them are stored against a
          randomly generated identifier rather than your name or your email, and
          the files themselves carry no identifying detail in their names or
          their contents. Your identity lives in a separate database.
        </p>
        <p>
          That is a real protection, and it is not anonymity. While we can
          reconnect an identifier to you — and through our own account system,
          we can — the data is still personal information, and this note treats
          it as such throughout. We will not describe anything as anonymous
          unless it has been processed so that a person is no longer reasonably
          identifiable from it.
        </p>
      </Section>

      <Section title="7. Where it is stored">
        <p>
          Lumentis Analytics Inc. is a Canadian company. Recordings, files and
          the application database are stored in Frankfurt, Germany. The
          application itself is served by Vercel, whose network is global, so
          requests may be handled outside that region even though the data at
          rest is not.
        </p>
        <p>
          Authorised Lumentis personnel may access the data from Canada and
          Italy, where necessary to run, maintain and support the service.
        </p>
      </Section>

      <Section title="8. Security">
        <p>
          Some of what protects your data comes from the platforms we build on,
          by default and without us configuring anything:
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            Files are encrypted at rest. Amazon S3 applies AES-256 server-side
            encryption to every new object as a baseline that cannot be switched
            off (
            <a
              href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-encryption-faq.html"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-ink hover:underline"
            >
              AWS documents this
            </a>
            ).
          </li>
          <li>
            The database is encrypted at rest and reached over TLS; see{" "}
            <a
              href="https://neon.com/docs/security/security-overview"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-ink hover:underline"
            >
              Neon&rsquo;s security overview
            </a>
            .
          </li>
          <li>Traffic between your browser and us travels over HTTPS.</li>
        </ul>
        <p>And some of it is our own doing:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            Passwords are stored only as Argon2 hashes. We cannot read them.
          </li>
          <li>
            Your files are never public. They are reached through links that are
            generated for one file and expire within minutes.
          </li>
          <li>
            Access to the systems holding recordings is limited to the small
            number of people who run the service.
          </li>
          <li>
            Identity is kept in a different place from the recordings, as
            described in section 6.
          </li>
        </ul>
        <p>
          Linking to those pages tells you what our providers do; it is not a
          claim that everything on our side is configured perfectly. No system
          is completely secure, and we cannot promise that yours will never be
          breached. What we can promise is that we will investigate anything we
          suspect and tell you where the law requires it — and, for something
          this sensitive, where it does not but you would obviously want to
          know.
        </p>
      </Section>

      <Section title="9. Keeping it, and deleting it">
        <p>
          We keep your account and your recordings while your account exists and
          this prototype is running. We have not set a fixed retention period
          yet and we are not going to invent one here: you can export or delete
          everything yourself, at any time, from your account page.
        </p>
        <p>
          Because this is a prototype, data may also be removed when we reset an
          environment. We will give you notice before doing that deliberately.
        </p>
        <p>
          <strong className="text-ink">When you delete your account</strong>, we
          delete your personal information: your recordings and the files behind
          them, the analyses and reports derived from them, your profile —
          including any health-related answers you gave — and the account
          itself.
        </p>
        <p>
          One narrow exception. We keep a minimal record that consent was given
          and later withdrawn or deleted, so that we can show we asked properly
          and honoured your request. That record contains no EEG data, no health
          information, no name and no email address — only an account
          identifier, which version of this note was agreed to, and when. Once
          your account is deleted, that identifier no longer points to anything
          we hold.
        </p>
        <p>
          Backups are not edited by hand. Copies of data held in backups
          disappear as those backups expire on their normal cycle.
        </p>
      </Section>

      <Section title="10. Who else sees it">
        <p>
          We do not sell your personal information and we do not share it for
          advertising. It is disclosed only to the providers who host and run
          the service on our behalf under contract — today our cloud storage,
          database, hosting and email providers — to professional advisers where
          genuinely necessary, where the law or a valid legal process requires
          it, to protect people from harm, in connection with a business
          transaction subject to privacy law, and to anyone you ask us to share
          it with.
        </p>
      </Section>

      <Section title="11. Your rights">
        <p>
          Two of these you can exercise yourself, right now, from your account
          page: <strong className="text-ink">export everything</strong> we hold
          about you, and{" "}
          <strong className="text-ink">delete your account</strong>. You can
          also grant or withdraw the optional research consent there.
        </p>
        <p>
          For anything else — access, correction, restricting or objecting to
          particular processing, or asking what we have disclosed — write to{" "}
          <a
            href={`mailto:${PRIVACY_EMAIL}`}
            className="font-semibold text-ink hover:underline"
          >
            {PRIVACY_EMAIL}
          </a>
          . A person reads that address. We may need to confirm who you are
          before we act.
        </p>
        <p>
          If you are not satisfied with how we have handled something, you can
          complain to the Office of the Privacy Commissioner of Canada, or to
          the Office of the Information and Privacy Commissioner for British
          Columbia.
        </p>
      </Section>

      <Section title="12. Cookies">
        <p>
          We use one cookie, to keep you signed in, and browser storage for
          small preferences such as whether you chose the light or the dark
          theme. No advertising cookies, no third-party analytics, no tracking
          pixels. If you block the session cookie you will not be able to sign
          in.
        </p>
        <p>
          A session cookie or a stored identifier does not make your recordings
          anonymous. If an identifier lets us find your data, that data is still
          personal information.
        </p>
      </Section>

      <Section title="13. Age">
        <p>
          Brain Trails is for people aged 18 and over. We do not knowingly open
          accounts for anyone younger. If you believe someone under 18 has
          created an account, write to us and we will delete it.
        </p>
      </Section>

      <Section title="14. Other services">
        <p>
          Brain Trails works with a Muse EEG headband, which is made and
          supported by another company under its own privacy policy. The same
          goes for the infrastructure providers named above. We encourage you to
          read their notices.
        </p>
      </Section>

      <Section title="15. Changes to this note">
        <p>
          When we change this note in a way that matters, we will publish a new
          version and ask you to read and agree to it the next time you sign in.
          The version is at the top of this page and is recorded against your
          account when you agree, so there is always a record of what you
          actually agreed to.
        </p>
      </Section>

      <Section title="16. Contact">
        <p>
          Questions, requests or complaints:{" "}
          <a
            href={`mailto:${PRIVACY_EMAIL}`}
            className="font-semibold text-ink hover:underline"
          >
            {PRIVACY_EMAIL}
          </a>
          , or Lumentis Analytics Inc., Attn: Privacy Officer, 329 Howe Street,
          Unit 272, Vancouver, British Columbia V6C 3N2, Canada.
        </p>
      </Section>

      {inOwnTab ? (
        <CloseTabButton className={EXIT_CLASS} />
      ) : (
        <BackLink className={EXIT_CLASS} />
      )}
    </main>
  );
}
