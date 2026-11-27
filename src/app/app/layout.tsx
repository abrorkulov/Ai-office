import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Frame } from "@/features/app/frame";
import { Providers } from "@/features/app/providers";
import { currentAuth } from "@/server/security/session";

// Внутренние страницы зависят от входа, мгновенный статический показ для них не нужен.
export const instant = false;

async function Gate({ children }: { children: React.ReactNode }) {
  await connection(); // вход проверяется на каждый запрос
  if (!(await currentAuth())) redirect("/login");
  return (
    <Providers>
      <Frame>{children}</Frame>
    </Providers>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
