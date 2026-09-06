"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button, Card } from "@/components/ui";

export default function RecordingsPage() {
  const router = useRouter();
  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Brain Trails</h1>
        <Button
          variant="ghost"
          onClick={async () => {
            await api.logout();
            router.push("/login");
          }}
        >
          Sign out
        </Button>
      </header>
      <Card>
        <p className="text-sm text-neutral-500">
          Recordings UI arrives with Sprint 06: upload, job status, and the
          trail plot.
        </p>
      </Card>
    </main>
  );
}
