import { fetchJSON } from './api.js';
import { button, el } from './dom.js';

// Окно виджета в духе классической Mac OS: закрыть слева, свернуть в заголовок справа
export class UIComponent {
  static type = 'base';

  constructor(id, title, { collapsed = false, onRemove, onChange } = {}) {
    this.id = id;
    this.title = title;
    this.collapsed = collapsed === true;
    this.onRemove = onRemove;
    this.onChange = onChange;
    this.element = null;
    this.destroyed = false;
    // Один сигнал снимает все обработчики карточки разом
    this.listeners = new AbortController();
    this.intervals = new Set();
    this.requests = new Map();
    this.cleanups = [];
  }

  get type() {
    return this.constructor.type;
  }

  listen(target, type, handler, options = {}) {
    target.addEventListener(type, handler, { ...options, signal: this.listeners.signal });
  }

  render() {
    const root = el('section', 'window widget');
    root.id = this.id;
    root.dataset.type = this.type;
    root.setAttribute('aria-labelledby', `${this.id}-title`);
    this.element = root;

    const bar = el('div', 'window-bar');
    this.closeButton = button('window-box box-close');
    this.closeButton.setAttribute('aria-label', `Удалить виджет «${this.title}»`);
    this.closeButton.title = 'Удалить';

    this.heading = el('h2', 'window-title', this.title);
    this.heading.id = `${this.id}-title`;
    this.heading.tabIndex = -1;

    this.shadeButton = button('window-box box-shade');
    this.shadeButton.setAttribute('aria-controls', `${this.id}-body`);
    bar.append(this.closeButton, this.heading, this.shadeButton);

    this.body = el('div', 'window-body');
    this.body.id = `${this.id}-body`;
    root.append(bar, this.renderConfirm(), this.body);

    this.listen(this.closeButton, 'click', () => this.requestRemove());
    this.listen(this.shadeButton, 'click', () => this.setCollapsed(!this.collapsed));

    this.renderBody(this.body);
    this.applyCollapsed();
    return root;
  }

  // Наследники наполняют тело окна
  renderBody() {}

  // Вызывается после вставки на страницу: здесь стартуют запросы
  mount() {}

  // Наследник может вернуть вопрос, если при удалении пропадут данные
  removalWarning() {
    return '';
  }

  renderConfirm() {
    this.confirmBox = el('div', 'window-confirm');
    this.confirmBox.hidden = true;
    this.confirmBox.setAttribute('role', 'group');
    this.confirmBox.setAttribute('aria-label', 'Подтверждение удаления');
    this.confirmText = el('p');

    const yes = button('btn btn-sm btn-danger', 'Удалить');
    this.confirmNo = button('btn btn-sm', 'Отмена');
    const actions = el('div', 'window-confirm-actions');
    actions.append(yes, this.confirmNo);
    this.confirmBox.append(this.confirmText, actions);

    this.listen(yes, 'click', () => this.onRemove?.(this.id));
    this.listen(this.confirmNo, 'click', () => this.hideConfirm());
    this.listen(this.confirmBox, 'keydown', (event) => {
      if (event.key === 'Escape') this.hideConfirm();
    });
    return this.confirmBox;
  }

  requestRemove() {
    const warning = this.removalWarning();
    if (!warning) {
      this.onRemove?.(this.id);
      return;
    }
    this.confirmText.textContent = warning;
    this.confirmBox.hidden = false;
    this.confirmNo.focus();
  }

  hideConfirm() {
    this.confirmBox.hidden = true;
    this.closeButton.focus();
  }

  setCollapsed(collapsed) {
    if (this.collapsed === collapsed) return;
    this.collapsed = collapsed;
    this.applyCollapsed();
    this.onCollapsedChange(collapsed);
    this.changed();
  }

  applyCollapsed() {
    const action = this.collapsed ? 'Развернуть' : 'Свернуть';
    this.body.hidden = this.collapsed;
    this.element.classList.toggle('is-collapsed', this.collapsed);
    this.shadeButton.setAttribute('aria-expanded', String(!this.collapsed));
    this.shadeButton.setAttribute('aria-label', `${action} «${this.title}»`);
    this.shadeButton.title = action;
  }

  onCollapsedChange() {}

  focus() {
    this.heading.focus({ preventScroll: true });
    this.element.scrollIntoView({ block: 'nearest' });
  }

  startInterval(callback, ms) {
    const id = setInterval(callback, ms);
    this.intervals.add(id);
    return id;
  }

  stopInterval(id) {
    clearInterval(id);
    this.intervals.delete(id);
  }

  // Новый запрос того же вида отменяет предыдущий
  async request(key, url, options = {}) {
    this.cancelRequest(key);
    const controller = new AbortController();
    this.requests.set(key, controller);
    try {
      return await fetchJSON(url, { ...options, signal: controller.signal });
    } finally {
      if (this.requests.get(key) === controller) this.requests.delete(key);
    }
  }

  cancelRequest(key) {
    this.requests.get(key)?.abort();
    this.requests.delete(key);
  }

  // Строка состояния: «загрузка» или ошибка с кнопкой «Повторить»
  createStatus(onRetry) {
    const live = el('div', 'status');
    live.setAttribute('aria-live', 'polite');
    const box = el('div', 'notice');
    const text = el('p');
    const retry = button('btn btn-sm', 'Повторить');
    box.append(text, retry);
    live.append(box);
    this.listen(retry, 'click', onRetry);

    const show = (state, message = '') => {
      box.hidden = state === 'ready';
      box.classList.toggle('notice-error', state === 'error');
      retry.hidden = state !== 'error';
      text.textContent = message;
    };
    show('ready');
    return { element: live, show };
  }

  addCleanup(callback) {
    this.cleanups.push(callback);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.listeners.abort();
    this.intervals.forEach((id) => clearInterval(id));
    this.intervals.clear();
    this.requests.forEach((controller) => controller.abort());
    this.requests.clear();
    this.cleanups.forEach((callback) => callback());
    this.cleanups = [];
    this.element?.remove();
    this.element = null;
  }

  getState() {
    return {};
  }

  serialize() {
    return { type: this.type, collapsed: this.collapsed, state: this.getState() };
  }

  changed() {
    this.onChange?.(this);
  }
}
