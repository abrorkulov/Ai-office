import type { Metadata } from "next";
import { Suspense } from "react";
import { KnowledgePage } from "@/features/knowledge/knowledge";
import { Loading } from "@/ui/kit";

export const metadata: Metadata = { title: "Знания" };

export default function Page() {
  return (
    <Suspense fallback={<Loading rows={6} />}>
      <KnowledgePage />
    </Suspense>
  );
}
