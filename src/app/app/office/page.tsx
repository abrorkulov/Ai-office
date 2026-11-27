import type { Metadata } from "next";
import { OfficePage } from "@/features/office/page";

export const metadata: Metadata = { title: "Офис" };

export default function Page() {
  return <OfficePage />;
}
