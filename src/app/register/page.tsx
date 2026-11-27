import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth/forms";

export const metadata: Metadata = { title: "Новая компания", referrer: "no-referrer" };

export default function Page() {
  return <RegisterForm />;
}
