import { AccountLocaleSync } from "@/components/AccountLocaleSync";
import { AppShell } from "@/components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <AccountLocaleSync />
      {children}
    </AppShell>
  );
}
