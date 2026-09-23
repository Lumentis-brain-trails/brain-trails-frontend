"use client";

import { useRouter } from "next/navigation";
import { hasInAppHistory } from "@/lib/appHistory";

/**
 * Closes the tab the privacy note was opened into.
 *
 * The sign-up consent step opens the note in a tab of its own, so the wizard in
 * the first tab survives being read away from. That tab has never been anywhere
 * else, so there is nothing in it to go back to: a back control could only offer
 * the home page, which is precisely not where the reader was. They were signing
 * up, in the tab still sitting behind this one. Closing returns them to it.
 *
 * `window.close()` is allowed here because such a tab holds a single session
 * history entry, which is what makes it script-closable. Should it not be — the
 * reader navigated inside it, or reached this URL some other way — the close is
 * refused silently, so we fall back rather than leave a control that does
 * nothing.
 */
export function CloseTabButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        window.close();
        // only reached when the tab was not script-closable: the document is
        // gone by now in the normal case, and this timer with it
        window.setTimeout(() => {
          if (hasInAppHistory()) router.back();
          else router.push("/");
        }, 150);
      }}
    >
      Close
    </button>
  );
}
