import { CurrencyWidget } from './CurrencyWidget.js';
import { IssWidget } from './IssWidget.js';
import { ToDoWidget } from './ToDoWidget.js';
import { UIComponent } from './UIComponent.js';
import { WeatherWidget } from './WeatherWidget.js';
import { el } from './dom.js';
import { savePanel } from './storage.js';

// Типы виджетов: по этому списку строятся кнопки «Добавить виджет»
export const WIDGET_TYPES = {
  todo: { title: 'Сборы', Widget: ToDoWidget },
  weather: { title: 'Погода', Widget: WeatherWidget },
  currency: { title: 'Валюты', Widget: CurrencyWidget },
  iss: { title: 'МКС сейчас', Widget: IssWidget },
};

// Карточка вместо виджета, который не смог открыться
class ErrorCard extends UIComponent {
  constructor(id, title, options) {
    super(id, title, options);
    this.failedType = options.type;
    this.record = options.record;
  }

  get type() {
    return this.failedType;
  }

  renderBody(body) {
    const notice = el('div', 'notice notice-error');
    notice.append(
      el('p', '', 'Виджет не открылся из-за ошибки. Остальные карточки работают.'),
      el('p', '', 'Закройте карточку и добавьте виджет заново.'),
    );
    body.append(notice);
  }

  // Сохраняем исходные данные, чтобы не потерять их из-за сбоя отрисовки
  serialize() {
    return { type: this.failedType, collapsed: this.collapsed, state: this.record.state ?? {} };
  }
}

export class Dashboard {
  constructor({ desk, emptyNote, onUpdate, onHint, onRemoved, onSaveError }) {
    this.desk = desk;
    this.emptyNote = emptyNote;
    this.onUpdate = onUpdate;
    this.onHint = onHint;
    this.onRemoved = onRemoved;
    this.onSaveError = onSaveError;
    this.widgets = new Map();
    this.counter = 0;
    this.attentionTimer = 0;
    this.restoring = false;
  }

  find(type) {
    for (const widget of this.widgets.values()) {
      if (widget.type === type) return widget;
    }
    return null;
  }

  addWidget(type, record = {}) {
    if (!Object.hasOwn(WIDGET_TYPES, type)) return null;
    const { title, Widget } = WIDGET_TYPES[type];

    const existing = this.find(type);
    if (existing) {
      this.onHint?.(`«${title}» уже на панели`);
      this.drawAttention(existing);
      return null;
    }

    this.counter += 1;
    const id = `${type}-${this.counter}`;
    const options = {
      collapsed: record.collapsed,
      state: record.state,
      onRemove: (widgetId) => this.removeWidget(widgetId),
      onChange: () => this.save(),
    };

    let widget;
    try {
      widget = new Widget(id, title, options);
      this.desk.append(widget.render());
      widget.mount();
    } catch {
      widget?.destroy();
      widget = new ErrorCard(id, title, { ...options, type, record });
      this.desk.append(widget.render());
    }

    this.widgets.set(id, widget);
    this.changed();
    return widget;
  }

  removeWidget(id) {
    const widget = this.widgets.get(id);
    if (!widget) return;
    widget.destroy();
    this.widgets.delete(id);
    this.changed();
    this.onRemoved?.(widget.type);
  }

  // Короткая подсветка окна, которое уже есть на панели
  drawAttention(widget) {
    clearTimeout(this.attentionTimer);
    this.desk.querySelector('.is-attention')?.classList.remove('is-attention');
    widget.element.classList.add('is-attention');
    widget.element.scrollIntoView({ block: 'nearest' });
    this.attentionTimer = setTimeout(() => widget.element?.classList.remove('is-attention'), 1200);
  }

  // Восстановление набора: неизвестные и повторные типы пропускаются
  restore(records) {
    this.restoring = true;
    let skipped = 0;
    for (const record of records) {
      const known = typeof record?.type === 'string' && Object.hasOwn(WIDGET_TYPES, record.type);
      if (known && !this.find(record.type)) this.addWidget(record.type, record);
      else skipped += 1;
    }
    this.restoring = false;
    this.changed();
    return skipped;
  }

  save() {
    if (this.restoring) return;
    const records = [...this.widgets.values()].map((widget) => widget.serialize());
    if (!savePanel(records)) this.onSaveError?.();
  }

  changed() {
    this.emptyNote.hidden = this.widgets.size > 0;
    this.onUpdate?.();
    this.save();
  }
}
