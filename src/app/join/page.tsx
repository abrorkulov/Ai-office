import type { Metadata } from "next";
import { JoinForm } from "@/features/auth/forms";

export const metadata: Metadata = { title: "Вход в команду", referrer: "no-referrer" };

export default function Page() {
  return <JoinForm />;
}
