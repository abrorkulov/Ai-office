"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ApiError } from "@/shared/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 2000, retry: (n, e) => n < 2 && !(e instanceof ApiError && e.status >= 400 && e.status < 500) },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster position="bottom-right" toastOptions={{ style: { fontFamily: "var(--ff-text)", borderRadius: 8 } }} />
    </QueryClientProvider>
  );
}
