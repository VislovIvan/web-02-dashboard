import { Dashboard, WIDGET_TYPES } from './Dashboard.js';
import { button, el } from './dom.js';
import { loadPanel } from './storage.js';

// Первый заход: все четыре виджета и пример списка сборов
const DEFAULT_PANEL = [
  {
    type: 'todo',
    state: {
      tasks: [
        { text: 'Загранпаспорт', done: true },
        { text: 'Билеты и страховка', done: false },
        { text: 'Переходник для розеток', done: false },
        { text: 'Наличные евро', done: false },
      ],
    },
  },
  { type: 'weather', state: { city: 'naples' } },
  { type: 'currency' },
  { type: 'iss' },
];

const MESSAGES = {
  corrupt: 'Сохранённые данные повреждены, поэтому открыта панель по умолчанию.',
  partial: 'Часть сохранённых данных не прочиталась и пропущена.',
  unavailable: 'Сохранение недоступно: браузер запретил хранить данные, изменения пропадут после обновления страницы.',
};

const buttonsBox = document.getElementById('add-buttons');
const hint = document.getElementById('toolbar-hint');
const message = document.getElementById('app-message');
const messageText = document.getElementById('app-message-text');
const addButtons = new Map();

function showHint(text) {
  // Очистка перед записью: одинаковая подсказка зачитывается повторно
  hint.textContent = '';
  if (!text) return;
  requestAnimationFrame(() => {
    hint.textContent = text;
  });
}

function showMessage(text) {
  messageText.textContent = text;
  message.hidden = false;
}

const dashboard = new Dashboard({
  desk: document.getElementById('desk'),
  emptyNote: document.getElementById('desk-empty'),
  onHint: showHint,
  onUpdate: syncButtons,
  onRemoved: (type) => addButtons.get(type)?.focus({ preventScroll: true }),
  onSaveError: () => showMessage(MESSAGES.unavailable),
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

const saved = loadPanel();
if (saved.status === 'unavailable') showMessage(MESSAGES.unavailable);

const skipped = saved.status === 'ok' ? dashboard.restore(saved.widgets) : 0;
// Пустой сохранённый набор оставляем пустым, нечитаемый заменяем панелью по умолчанию
const unreadable = saved.status === 'corrupt' || (skipped > 0 && dashboard.widgets.size === 0);
if (saved.status !== 'ok' || unreadable) dashboard.restore(DEFAULT_PANEL);
if (unreadable) showMessage(MESSAGES.corrupt);
else if (skipped > 0) showMessage(MESSAGES.partial);
