import type { Metadata } from "next";
import { DevPage } from "@/features/dev/dev";

export const metadata: Metadata = { title: "Разработка" };

export default function Page() {
  return <DevPage />;
}
