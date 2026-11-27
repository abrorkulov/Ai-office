import type { Metadata } from "next";
import { InviteForm } from "@/features/auth/forms";

export const metadata: Metadata = { title: "Приглашение", referrer: "no-referrer" };

export default function Page() {
  return <InviteForm />;
}
