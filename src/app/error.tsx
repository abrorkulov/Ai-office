"use client";

import { Button } from "@/ui/kit";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold">Страница не открылась</h1>
      <p className="text-ink-2">Данные не пострадали. Попробуйте ещё раз.</p>
      <Button look="primary" className="self-start" onClick={reset}>Повторить</Button>
    </main>
  );
}
