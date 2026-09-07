import { AppHeader } from "@/components/AppHeader";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <AppHeader />
      {children}
    </div>
  );
}
