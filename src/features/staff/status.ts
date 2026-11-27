import type { LiveStatus } from "@/server/modules/staff";

export const STATUS: Record<LiveStatus, { label: string; color: string }> = {
  working: { label: "Работает", color: "#1f9d55" },
  waiting: { label: "Ждёт решения", color: "#e08a00" },
  idle: { label: "Свободен", color: "#8a919c" },
  break: { label: "На перерыве", color: "#b9824c" },
  paused: { label: "На паузе", color: "#b6bac1" },
  offline: { label: "Не в сети", color: "#b6bac1" },
  setup: { label: "Нужна модель", color: "#d13b2e" },
  focus: { label: "В фокусе", color: "#7a4a9c" },
  meeting: { label: "На созвоне", color: "#1583a5" },
};
