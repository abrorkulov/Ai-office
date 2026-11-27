import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";

export const ago = (d: string | Date) => formatDistanceToNowStrict(new Date(d), { locale: ru, addSuffix: true });
export function when(d: string | Date) {
  const x = new Date(d);
  if (isToday(x)) return format(x, "HH:mm");
  if (isYesterday(x)) return `вчера, ${format(x, "HH:mm")}`;
  return format(x, "d MMM, HH:mm", { locale: ru });
}
export const day = (d: string | Date) => format(new Date(d), "d MMM", { locale: ru });
export const num = (n: number) => n.toLocaleString("ru-RU");
export const compact = (n: number) => new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(n);
/** Сумма хранится в копейках или центах. */
export const money = (minor: number, currency = "RUB") => new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b > 1 && b < 5 ? few : many;
}
export const minutes = (m: number) => (m % 1440 === 0 ? `${m / 1440} ${plural(m / 1440, "день", "дня", "дней")}` : m % 60 === 0 ? `${m / 60} ч` : `${m} мин`);
