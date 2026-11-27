"use client";

import { useState } from "react";
import { api } from "@/shared/api";
import { openFresh } from "@/shared/navigate";
import { buttonClass } from "@/ui/kit";

/** Вход в демо: у каждого гостя своя временная компания. */
export function DemoButton({ className, size = "lg", label = "Посмотреть вживую" }: { className?: string; size?: "md" | "lg"; label?: string }) {
  const [state, set] = useState<"idle" | "busy" | string>("idle");
  const go = async () => {
    set("busy");
    try {
      await api.post("/auth/demo");
      openFresh("/app");
    } catch (e) {
      set(e instanceof Error ? e.message : "Не получилось открыть");
    }
  };
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" disabled={state === "busy"} onClick={() => void go()} className={buttonClass("plain", size, className)}>
        {state === "busy" ? "Открываем…" : label}
      </button>
      {state !== "idle" && state !== "busy" && <span role="alert" className="text-sm text-bad">{state}</span>}
    </span>
  );
}
