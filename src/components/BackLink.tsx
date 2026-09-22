"use client";

import { useRouter } from "next/navigation";
import { hasInAppHistory } from "@/lib/appHistory";

/**
 * A back control that returns the reader wherever they came from, rather than to
 * one fixed destination.
 *
 * The privacy note is reached from several places — the entry screen's footer,
 * the auth screens' footer — so the "Back home" link it used to carry stranded
 * everyone who did not arrive from the home page. Popping the history entry is
 * what a back control promises; when there is none of ours to pop (the note was
 * opened directly, or in a tab of its own) it falls back to the home page, which
 * is the one place such a visitor can be sent without guessing.
 *
 * A button and not a link: the destination is whatever the session's history
 * holds, so there is no href to render, and this is an action, not a place.
 */
export function BackLink({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (hasInAppHistory()) router.back();
        else router.push("/");
      }}
    >
      Back
    </button>
  );
}
