import { redirect } from "next/navigation";

/** Your media moved to its own section; kept one release for old links. */
export default function ProtocolsMediaRedirect() {
  redirect("/media");
}
