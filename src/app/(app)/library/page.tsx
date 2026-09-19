import { redirect } from "next/navigation";

/** The library became the protocol catalog (plan V3, S16); kept one release for old links. */
export default function LibraryRedirect() {
  redirect("/protocols");
}
