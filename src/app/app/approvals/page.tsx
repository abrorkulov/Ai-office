import type { Metadata } from "next";
import { ApprovalsPage } from "@/features/tasks/tasks";

export const metadata: Metadata = { title: "Решения" };

export default function Page() {
  return <ApprovalsPage />;
}
