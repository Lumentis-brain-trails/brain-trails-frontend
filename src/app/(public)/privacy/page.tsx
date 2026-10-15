import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { BackLink } from "@/components/BackLink";
import { CloseTabButton } from "@/components/CloseTabButton";

/** The tab's title in the reader's language; the root layout appends the product name. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy");
  return { title: t("metaTitle") };
}

const EXIT_CLASS =
  "mt-10 inline-block text-[14px] font-semibold text-ink hover:underline";

const LINK_CLASS = "font-semibold text-ink hover:underline";

/**
 * The version this text is published under. It must match `CONSENT_VERSION` in the
 * backend, which is what gets written against an account when somebody agrees. Two
 * places, changed together: a demo does not need a sync mechanism, it needs the string
 * to name a text that exists.
 *
 * The text itself is the `privacy` namespace of `messages/en.json`, the legally reviewed
 * reference, with its translations beside it. There is no second copy kept on purpose -
 * the record of what somebody agreed to is that namespace's history in git, and a
 * duplicate that can drift from what is actually served would be worse than no duplicate
 * at all.
 */
const POLICY_VERSION = "2026-09-22";

const PRIVACY_EMAIL = "privacy@lumentis.ca";

/** Where the security section's claims about the platforms can be checked. */
const AWS_ENCRYPTION_URL =
  "https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-encryption-faq.html";
const NEON_SECURITY_URL = "https://neon.com/docs/security/security-overview";

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

/** `<strong>` in a message: the run-in heading or the emphasised words of a paragraph. */
function strong(chunks: ReactNode) {
  return <strong className="text-ink">{chunks}</strong>;
}

/** `<email>` in a message: the privacy address as a link that opens the mail client. */
function email(chunks: ReactNode) {
  return (
    <a href={`mailto:${PRIVACY_EMAIL}`} className={LINK_CLASS}>
      {chunks}
    </a>
  );
}

/** `<link>` in a message: a provider's own documentation, opened in a tab of its own. */
function external(href: string) {
  function ExternalLink(chunks: ReactNode) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={LINK_CLASS}>
        {chunks}
      </a>
    );
  }
  return ExternalLink;
}

/**
 * The privacy note. Every sentence is a message of the `privacy` namespace, one key per
 * paragraph, heading or list item, so the legal text reads as a document in the catalogue
 * and is never assembled from fragments here.
 *
 * `?in=tab` is set by the links that open the note in a tab of its own, today the
 * sign-up consent step and the account page. It decides the exit control and nothing
 * else: a tab that was opened to show this one page is closed, not navigated back out of.
 */
export default async function PrivacyPage({
  searchParams,
}: PageProps<"/privacy">) {
  const inOwnTab = (await searchParams).in === "tab";
  const t = await getTranslations("privacy");
  const s = await getTranslations("privacy.sections");
  return (
    <main className="type-body mx-auto w-full max-w-2xl px-6 py-16 text-pretty text-ink-2">
      <p className="type-eyebrow text-ink-3">
        {t("eyebrow", { version: POLICY_VERSION })}
      </p>
      <h1 className="type-title mt-3 text-ink">{t("title")}</h1>

      <div className="mt-8 rounded-[var(--radius-card)] bg-surface-2 p-5">
        <p>{t.rich("draft", { strong })}</p>
      </div>

      <p className="mt-6">{t("intro")}</p>

      <Section title={s("whatItIs.title")}>
        <p>{s("whatItIs.p1")}</p>
        <p>{s("whatItIs.p2")}</p>
      </Section>

      <Section title={s("whoWeAre.title")}>
        <p>{s("whoWeAre.p1")}</p>
        <p>
          {s("whoWeAre.addressee")}
          <br />
          {s("whoWeAre.postalAddress")}
          <br />
          {email(PRIVACY_EMAIL)}
        </p>
      </Section>

      <Section title={s("collect.title")}>
        <p>{s.rich("collect.p1", { strong })}</p>
        <p>{s.rich("collect.p2", { strong })}</p>
        <p>{s.rich("collect.p3", { strong })}</p>
        <p>{s("collect.p4")}</p>
        <p>{s.rich("collect.p5", { strong })}</p>
      </Section>

      <Section title={s("use.title")}>
        <p>{s("use.p1")}</p>
        <p>{s.rich("use.p2", { strong })}</p>
        <p>{s.rich("use.p3", { strong })}</p>
        <p>{s("use.p4")}</p>
      </Section>

      <Section title={s("consent.title")}>
        <p>{s("consent.p1")}</p>
        <p>{s("consent.p2")}</p>
      </Section>

      <Section title={s("pseudonymised.title")}>
        <p>{s("pseudonymised.p1")}</p>
        <p>{s("pseudonymised.p2")}</p>
      </Section>

      <Section title={s("storage.title")}>
        <p>{s("storage.p1")}</p>
        <p>{s("storage.p2")}</p>
      </Section>

      <Section title={s("security.title")}>
        <p>{s("security.p1")}</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            {s.rich("security.platforms.1", {
              link: external(AWS_ENCRYPTION_URL),
            })}
          </li>
          <li>
            {s.rich("security.platforms.2", {
              link: external(NEON_SECURITY_URL),
            })}
          </li>
          <li>{s("security.platforms.3")}</li>
        </ul>
        <p>{s("security.p2")}</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>{s("security.own.1")}</li>
          <li>{s("security.own.2")}</li>
          <li>{s("security.own.3")}</li>
          <li>{s("security.own.4")}</li>
        </ul>
        <p>{s("security.p3")}</p>
      </Section>

      <Section title={s("retention.title")}>
        <p>{s("retention.p1")}</p>
        <p>{s("retention.p2")}</p>
        <p>{s.rich("retention.p3", { strong })}</p>
        <p>{s("retention.p4")}</p>
        <p>{s("retention.p5")}</p>
      </Section>

      <Section title={s("disclosure.title")}>
        <p>{s("disclosure.p1")}</p>
      </Section>

      <Section title={s("rights.title")}>
        <p>{s.rich("rights.p1", { strong })}</p>
        <p>{s.rich("rights.p2", { email, privacyEmail: PRIVACY_EMAIL })}</p>
        <p>{s("rights.p3")}</p>
      </Section>

      <Section title={s("cookies.title")}>
        <p>{s("cookies.p1")}</p>
        <p>{s("cookies.p2")}</p>
      </Section>

      <Section title={s("age.title")}>
        <p>{s("age.p1")}</p>
      </Section>

      <Section title={s("otherServices.title")}>
        <p>{s("otherServices.p1")}</p>
      </Section>

      <Section title={s("changes.title")}>
        <p>{s("changes.p1")}</p>
      </Section>

      <Section title={s("contact.title")}>
        <p>{s.rich("contact.p1", { email, privacyEmail: PRIVACY_EMAIL })}</p>
      </Section>

      {inOwnTab ? (
        <CloseTabButton className={EXIT_CLASS} />
      ) : (
        <BackLink className={EXIT_CLASS} />
      )}
    </main>
  );
}
