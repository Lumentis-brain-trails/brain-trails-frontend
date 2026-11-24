"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { Skeleton } from "@/components/ui";
import { Sections } from "@console/components/Sections";
import { useMe } from "@console/components/data";
import type { AppPageProps } from "@console/lib/manifest";
import { DocumentEditor } from "./sections/DocumentEditor";
import { DocumentList } from "./sections/DocumentList";
import { DocumentView } from "./sections/DocumentView";
import { TokensSection } from "./sections/Tokens";

/** A revision number from the address, or null when it is not one. */
function revisionParam(value: string | null): number | null {
  if (!value || !/^\d{1,9}$/.test(value)) return null;
  return Number(value);
}

/**
 * The library: the list, a document (`?doc=<slug>`, at an old revision with `&rev=<n>`),
 * or the editor of a new one. The document and its revision live in the address, so a
 * link to a report opens that report; going back returns to the list.
 */
function Library({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const slug = search.get("doc");
  const revision = revisionParam(search.get("rev"));
  const [creating, setCreating] = useState(false);

  const open = (next: string | null, rev: number | null = null) => {
    const params = new URLSearchParams(search.toString());
    params.delete("doc");
    params.delete("rev");
    if (next) params.set("doc", next);
    if (next && rev !== null) params.set("rev", String(rev));
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  if (creating) {
    return (
      <DocumentEditor
        onSaved={(doc) => {
          setCreating(false);
          open(doc.slug);
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }
  if (slug) {
    return (
      <DocumentView
        key={slug}
        slug={slug}
        revision={revision}
        canWrite={canWrite}
        onBack={() => open(null)}
        onOpenRevision={(rev) => open(slug, rev)}
      />
    );
  }
  return (
    <DocumentList
      onOpen={(s) => open(s)}
      onNew={canWrite ? () => setCreating(true) : undefined}
    />
  );
}

/**
 * Documents: every report, draft, brief and analysis written for the team lives here,
 * not in chat tools (backend OPS-0005). Reading needs `documents:read`, writing
 * `documents:write`; a person with `tokens:manage` also finds their access tokens here,
 * the door a working session writes documents through.
 */
export function DocumentsApp({ semver }: AppPageProps) {
  const t = useTranslations("console.documents");
  const me = useMe();
  const scopes = me.data?.scopes ?? [];
  const canWrite = scopes.includes("documents:write");
  const library = (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <Library canWrite={canWrite} />
    </Suspense>
  );
  return (
    <div data-version={semver} className="grid max-w-5xl gap-6">
      <p className="text-ink-2">{t("intro")}</p>
      {scopes.includes("tokens:manage") ? (
        <Sections
          label={t("sections")}
          sections={[
            { id: "library", label: t("library"), render: () => library },
            {
              id: "tokens",
              label: t("tokens.title"),
              render: () => <TokensSection />,
            },
          ]}
        />
      ) : (
        library
      )}
    </div>
  );
}
