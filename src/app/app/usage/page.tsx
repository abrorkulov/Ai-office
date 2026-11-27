import type { Metadata } from "next";
import { UsagePage } from "@/features/usage/usage";

export const metadata: Metadata = { title: "Расходы ИИ" };

export default function Page() {
  return <UsagePage />;
}
