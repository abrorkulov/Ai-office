import type { Metadata } from "next";
import { ResetForm } from "@/features/auth/forms";

export const metadata: Metadata = { title: "Новый пароль", referrer: "no-referrer" };

export default function Page() {
  return <ResetForm />;
}
