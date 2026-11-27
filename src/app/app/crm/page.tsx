import type { Metadata } from "next";
import { CrmPage } from "@/features/crm/crm";

export const metadata: Metadata = { title: "Клиенты" };

export default function Page() {
  return <CrmPage />;
}
