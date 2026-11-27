import type { Metadata } from "next";
import { ForgotForm } from "@/features/auth/forms";

export const metadata: Metadata = { title: "Восстановление пароля" };

export default function Page() {
  return <ForgotForm />;
}
