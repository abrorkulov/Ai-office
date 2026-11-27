import Link from "next/link";
import { Logo } from "@/features/site/logo";
import { buttonClass } from "@/ui/button-class";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6">
      <Logo />
      <h1 className="text-3xl font-semibold">Такой страницы нет</h1>
      <Link href="/" className={buttonClass("primary", "md", "self-start")}>На главную</Link>
    </main>
  );
}
