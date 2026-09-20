import { redirect } from "next/navigation";

/**
 * Free recording is a protocol now (V3-0004 amendment, S18): it is played from the
 * catalog like everything else, so every run has a version, a plan and block events.
 * Kept one release for old links.
 */
export default function RecordRedirect() {
  redirect("/protocols");
}
