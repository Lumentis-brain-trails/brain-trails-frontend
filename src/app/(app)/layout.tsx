import { AccountLocaleSync } from "@/components/AccountLocaleSync";
import { AppShell } from "@/components/AppShell";
import { UsageTracker } from "@/components/UsageTracker";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <AccountLocaleSync />
      <UsageTracker />
      {children}
    </AppShell>
  );
}
