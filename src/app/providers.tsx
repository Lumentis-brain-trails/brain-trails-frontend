"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { recordNavigation } from "@/lib/appHistory";
import { ToastProvider } from "@/components/Toast";

/**
 * Notes each route change the App Router makes without reloading the document, so
 * a back control can tell a visitor who has been moving around the app from one
 * who arrived on a direct link (see `@/lib/appHistory`).
 *
 * Its own component, rendering nothing: reading the pathname in `Providers` would
 * re-render the whole tree on every navigation.
 */
function NavigationRecorder() {
  const pathname = usePathname();
  // the route the document was loaded on; comparing against it rather than
  // counting runs keeps this correct under StrictMode's double-invoked effects
  const last = useRef(pathname);
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    recordNavigation();
  }, [pathname]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <NavigationRecorder />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}
