import Link from "next/link";
import { Wordmark } from "@/components/Logo";

/** Quiet chrome for the auth flow: the mark as a way home, nothing else. */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center px-6">
        <Link href="/" className="text-ink">
          <Wordmark size={16} />
        </Link>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
