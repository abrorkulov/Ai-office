import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfilePage } from "@/features/staff/profile";

export const metadata: Metadata = { title: "Сотрудник" };

async function Profile({ params }: { params: Promise<{ id: string }> }) {
  return <ProfilePage id={(await params).id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Profile params={params} />
    </Suspense>
  );
}
