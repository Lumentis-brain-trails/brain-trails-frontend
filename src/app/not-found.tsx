import Link from "next/link";
import { Card } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md text-center">
        <h1 className="mb-2 text-xl font-semibold">Page not found</h1>
        <Link
          href="/recordings"
          className="text-sm text-indigo-600 hover:underline"
        >
          Back to recordings
        </Link>
      </Card>
    </main>
  );
}
