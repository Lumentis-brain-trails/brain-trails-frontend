import Link from "next/link";
import { Card } from "@/components/ui";

export default function PendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md text-center">
        <h1 className="mb-2 text-xl font-semibold">Registration received</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          An administrator will review your registration. Once approved, you
          will receive an email-verification link. After verifying, you can{" "}
          <Link href="/login" className="text-indigo-600 hover:underline">
            sign in
          </Link>
          .
        </p>
      </Card>
    </main>
  );
}
