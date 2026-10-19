import { UIComponent } from './UIComponent.js';
import { button, el, plural } from './dom.js';

const MAX_LENGTH = 80;
let taskCounter = 0;

function createTask(text, done = false) {
  taskCounter += 1;
  return { id: `task-${taskCounter}`, text, done };
}

// Из сохранённых данных берём только задачи с непустым текстом
function readTasks(saved) {
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((task) => typeof task?.text === 'string' && task.text.trim())
    .map((task) => createTask(task.text.trim().slice(0, MAX_LENGTH), task.done === true));
}

export class ToDoWidget extends UIComponent {
  static type = 'todo';

  constructor(id, title, options = {}) {
    super(id, title, options);
    this.tasks = readTasks(options.state?.tasks);
  }

  renderBody(body) {
    const form = el('form', 'todo-form');
    form.noValidate = true;

    const label = el('label', 'visually-hidden', 'Новая задача');
    label.htmlFor = `${this.id}-input`;
    this.input = el('input', 'input');
    this.input.id = `${this.id}-input`;
    this.input.type = 'text';
    this.input.maxLength = MAX_LENGTH;
    this.input.placeholder = 'Например, зарядка';
    this.input.autocomplete = 'off';
    this.input.setAttribute('aria-describedby', `${this.id}-error`);

    const add = el('button', 'btn', 'Добавить');
    add.type = 'submit';
    const row = el('div', 'todo-row');
    row.append(this.input, add);

    this.error = el('p', 'field-error todo-error');
    this.error.id = `${this.id}-error`;
    this.error.setAttribute('aria-live', 'polite');
    form.append(label, row, this.error);

    this.summary = el('div', 'todo-summary');
    this.counter = el('p', 'label');
    this.counter.setAttribute('aria-live', 'polite');
    const track = el('div', 'todo-progress');
    this.bar = el('span', 'todo-progress-bar');
    track.append(this.bar);
    this.summary.append(this.counter, track);

    this.list = el('ul', 'todo-list');
    this.emptyNote = el('p', 'muted todo-empty', 'Список пуст: добавьте, что взять в поездку.');
    this.tasks.forEach((task) => this.list.append(this.createItem(task)));
    body.append(form, this.summary, this.list, this.emptyNote);

    this.listen(form, 'submit', (event) => {
      event.preventDefault();
      this.addTask(this.input.value);
    });
    this.listen(this.input, 'input', () => this.setError(''));
    this.listen(this.list, 'change', (event) => this.toggleTask(event.target));
    this.listen(this.list, 'click', (event) => {
      const remove = event.target.closest('.todo-remove');
      // detail === 0: кнопку нажали с клавиатуры, фокус нужно сохранить
      if (remove) this.removeTask(remove.closest('.todo-item'), event.detail === 0);
    });
    this.updateSummary();
  }

  createItem(task) {
    const item = el('li', 'todo-item');
    item.dataset.id = task.id;
    item.classList.toggle('is-done', task.done);

    const label = el('label', 'todo-check');
    const box = el('input', 'check-input visually-hidden');
    box.type = 'checkbox';
    box.checked = task.done;
    const mark = el('span', 'check-box');
    mark.setAttribute('aria-hidden', 'true');
    label.append(box, mark, el('span', 'todo-text', task.text));

    const remove = button('window-box todo-remove');
    remove.setAttribute('aria-label', `Удалить «${task.text}»`);
    remove.title = 'Удалить';
    item.append(label, remove);
    return item;
  }

  addTask(value) {
    const text = value.trim().slice(0, MAX_LENGTH);
    if (!text) {
      this.setError('Введите задачу: пустую строку не добавляем.');
      this.input.focus();
      return;
    }
    const task = createTask(text);
    this.tasks.push(task);
    this.list.append(this.createItem(task));
    this.input.value = '';
    this.setError('');
    this.updateSummary();
    this.changed();
  }

  toggleTask(box) {
    const item = box.closest('.todo-item');
    const task = this.tasks.find(({ id }) => id === item?.dataset.id);
    if (!task) return;
    task.done = box.checked;
    item.classList.toggle('is-done', task.done);
    this.updateSummary();
    this.changed();
  }

  removeTask(item, keepFocus) {
    const index = this.tasks.findIndex(({ id }) => id === item?.dataset.id);
    if (index === -1) return;
    this.tasks.splice(index, 1);
    const next = item.nextElementSibling ?? item.previousElementSibling;
    item.remove();
    if (keepFocus) (next?.querySelector('.todo-remove') ?? this.input).focus();
    this.updateSummary();
    this.changed();
  }

  setError(message) {
    this.error.textContent = message;
    this.input.setAttribute('aria-invalid', String(Boolean(message)));
  }

  updateSummary() {
    const total = this.tasks.length;
    const done = this.tasks.filter((task) => task.done).length;
    this.counter.textContent = `Готово ${done} из ${total}`;
    this.bar.style.width = total ? `${(done / total) * 100}%` : '0';
    this.summary.hidden = total === 0;
    this.list.hidden = total === 0;
    this.emptyNote.hidden = total > 0;
  }

  removalWarning() {
    const count = this.tasks.length;
    if (!count) return '';
    return `Удалить «${this.title}» вместе с ${count} ${plural(count, 'задачей', 'задачами', 'задачами')}?`;
  }

  getState() {
    return { tasks: this.tasks.map(({ text, done }) => ({ text, done })) };
  }
}
