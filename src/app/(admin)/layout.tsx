import { AppShell } from "@/components/AppShell";
import { UsageTracker } from "@/components/UsageTracker";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <UsageTracker />
      {children}
    </AppShell>
  );
}
