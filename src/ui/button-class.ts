import clsx from "clsx";

// Отдельно от kit.tsx: классы нужны и серверным страницам.
export type Look = "primary" | "plain" | "ghost" | "danger";
const LOOK: Record<Look, string> = {
  primary: "bg-ink text-white hover:bg-ink/85",
  plain: "bg-panel text-ink border border-line-2 shadow-[0_1px_1px_rgb(10_10_11/0.04)] hover:bg-sunk",
  ghost: "text-ink-2 hover:bg-sunk hover:text-ink",
  danger: "bg-panel text-bad border border-line-2 hover:border-bad/40 hover:bg-bad-soft",
};
export const buttonClass = (look: Look = "plain", size: "sm" | "md" | "lg" = "md", extra?: string) =>
  clsx(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors duration-100 disabled:opacity-50 disabled:pointer-events-none select-none",
    size === "sm" ? "h-7 px-2.5 text-[12.5px]" : size === "lg" ? "h-10 px-4 text-[14px]" : "h-8 px-3 text-[13px]",
    LOOK[look],
    extra,
  );
