/** Знак: план трёх кабинетов в ряд («Ш»), в одном горит лампа. */
export function Logo({ light }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <rect width="22" height="22" rx="5.5" fill={light ? "#fff" : "#0a0a0b"} />
        <path d="M5.5 6v10h11V6M11 6v10" fill="none" stroke={light ? "#0a0a0b" : "#fff"} strokeWidth="1.9" strokeLinejoin="round" />
        <circle cx="14" cy="9" r="1.6" fill="#ff5b1f" />
      </svg>
      <span className={`text-[16px] font-semibold tracking-[-0.03em] ${light ? "text-white" : "text-ink"}`}>Штат</span>
    </span>
  );
}
