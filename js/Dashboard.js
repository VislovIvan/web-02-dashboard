import { ToDoWidget } from './ToDoWidget.js';
import { UIComponent } from './UIComponent.js';
import { el } from './dom.js';

// Типы виджетов: по этому списку строятся кнопки «Добавить виджет»
export const WIDGET_TYPES = {
  todo: { title: 'Сборы', Widget: ToDoWidget },
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
  constructor({ desk, emptyNote, onUpdate, onHint, onRemoved }) {
    this.desk = desk;
    this.emptyNote = emptyNote;
    this.onUpdate = onUpdate;
    this.onHint = onHint;
    this.onRemoved = onRemoved;
    this.widgets = new Map();
    this.counter = 0;
    this.attentionTimer = 0;
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
      onChange: () => this.changed(),
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

  changed() {
    this.emptyNote.hidden = this.widgets.size > 0;
    this.onUpdate?.();
  }
}
