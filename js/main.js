import { Dashboard, WIDGET_TYPES } from './Dashboard.js';
import { button, el } from './dom.js';

const buttonsBox = document.getElementById('add-buttons');
const hint = document.getElementById('toolbar-hint');
const addButtons = new Map();

function showHint(text) {
  // Очистка перед записью: одинаковая подсказка зачитывается повторно
  hint.textContent = '';
  if (!text) return;
  requestAnimationFrame(() => {
    hint.textContent = text;
  });
}

const dashboard = new Dashboard({
  desk: document.getElementById('desk'),
  emptyNote: document.getElementById('desk-empty'),
  onHint: showHint,
  onUpdate: syncButtons,
  onRemoved: (type) => addButtons.get(type)?.focus({ preventScroll: true }),
});

for (const [type, { title }] of Object.entries(WIDGET_TYPES)) {
  const add = button('btn add-button');
  add.dataset.type = type;
  const plus = el('span', 'add-plus', '+');
  plus.setAttribute('aria-hidden', 'true');
  add.append(plus, title);
  addButtons.set(type, add);
  buttonsBox.append(add);
}

function syncButtons() {
  for (const [type, add] of addButtons) {
    const onPanel = Boolean(dashboard.find(type));
    add.setAttribute('aria-disabled', String(onPanel));
    if (onPanel) add.title = 'Уже на панели';
    else add.removeAttribute('title');
  }
}

buttonsBox.addEventListener('click', (event) => {
  const add = event.target.closest('button[data-type]');
  if (!add) return;
  const widget = dashboard.addWidget(add.dataset.type);
  if (widget) {
    showHint('');
    widget.focus();
  }
});

dashboard.changed();
