import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="type-eyebrow text-ink-3">404</p>
      <h1 className="type-title mt-3">This page does not exist.</h1>
      <Link href="/home" className={buttonClass("ghost", "md", "mt-8")}>
        Back home
      </Link>
    </main>
  );
}
