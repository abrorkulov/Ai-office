import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/forms";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Вход" };

export default function Page() {
  return <LoginForm demo={env().demo} />;
}
