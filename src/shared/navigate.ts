/** Переход с полной перезагрузкой: при смене сеанса в памяти не должны остаться данные прежнего. */
export function openFresh(path: string) {
  window.location.href = path;
}
