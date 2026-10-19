// Создаёт элемент; текст кладётся только через textContent
export function el(tag, className = '', text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(className, text) {
  const node = el('button', className, text);
  node.type = 'button';
  return node;
}

const pluralRules = new Intl.PluralRules('ru-RU');

// Форма слова для числа: 1 задачей, 3 задачами, 5 задачами
export function plural(count, one, few, many) {
  const form = pluralRules.select(count);
  if (form === 'one') return one;
  return form === 'few' ? few : many;
}

export function formatClock(date, withSeconds = false) {
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds && { second: '2-digit' }),
  });
}
