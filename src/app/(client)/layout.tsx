import { AccountLocaleSync } from "@/components/AccountLocaleSync";
import { ClientShell } from "@/components/ClientShell";
import { UsageTracker } from "@/components/UsageTracker";

/** The client shell's pages (`/my`): backend V4-0006, sprint T3. */
export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClientShell>
      <AccountLocaleSync />
      <UsageTracker />
      {children}
    </ClientShell>
  );
}
