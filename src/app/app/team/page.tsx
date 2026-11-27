import type { Metadata } from "next";
import { TeamPage } from "@/features/staff/team";

export const metadata: Metadata = { title: "Команда" };

export default function Page() {
  return <TeamPage />;
}
