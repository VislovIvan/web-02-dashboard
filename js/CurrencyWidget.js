import { isAbortError } from './api.js';
import { button, el } from './dom.js';
import { UIComponent } from './UIComponent.js';

const BASE = 'EUR';
// Сверено с /v1/currencies: рубля в данных ЕЦБ нет
const QUOTES = ['USD', 'GBP', 'CHF', 'CNY', 'TRY', 'JPY'];
const RATES_URL = `https://api.frankfurter.dev/v1/latest?base=${BASE}&symbols=${QUOTES.join(',')}`;
const NAMES = {
  EUR: 'евро',
  USD: 'доллар США',
  GBP: 'фунт стерлингов',
  CHF: 'швейцарский франк',
  CNY: 'китайский юань',
  TRY: 'турецкая лира',
  JPY: 'японская иена',
};
const MAX_AMOUNT = 1e9;

const rateFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 });
const moneyFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

const knownCode = (code, fallback) => (Object.hasOwn(NAMES, code) ? code : fallback);

function readRates(data) {
  if (data?.base !== BASE || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || typeof data.rates !== 'object') {
    throw new Error('Сервис курсов прислал неполные данные.');
  }
  const rates = { [BASE]: 1 };
  for (const code of QUOTES) {
    const value = data.rates[code];
    if (typeof value === 'number' && value > 0) rates[code] = value;
  }
  if (Object.keys(rates).length < 2) throw new Error('В ответе нет ни одного курса.');
  const [year, month, day] = data.date.split('-');
  return { date: `${day}.${month}.${year}`, rates };
}

// «1 000,5» и «1000.5» читаем одинаково; отрицательные и пустые не принимаем
function parseAmount(text) {
  const normalized = text.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return value <= MAX_AMOUNT ? value : null;
}

export class CurrencyWidget extends UIComponent {
  static type = 'currency';

  constructor(id, title, options = {}) {
    super(id, title, options);
    const state = options.state ?? {};
    this.amount = typeof state.amount === 'string' && state.amount.length <= 20 ? state.amount : '100';
    this.from = knownCode(state.from, BASE);
    this.to = knownCode(state.to, 'USD');
    this.rates = null;
  }

  renderBody(body) {
    this.status = this.createStatus(() => this.load());
    this.result = el('div', 'currency-result');
    this.result.hidden = true;

    const table = el('table', 'rates');
    this.caption = el('caption', 'label');
    const head = el('thead');
    const headRow = el('tr');
    const currencyHead = el('th', '', 'Валюта');
    const valueHead = el('th', '', `За 1 ${BASE}`);
    currencyHead.scope = valueHead.scope = 'col';
    headRow.append(currencyHead, valueHead);
    head.append(headRow);
    this.rateRows = el('tbody');
    table.append(this.caption, head, this.rateRows);
    const note = el('p', 'updated', 'ЕЦБ публикует курсы по рабочим дням.');

    this.result.append(table, note, this.renderConverter());
    body.append(this.status.element, this.result);
  }

  renderConverter() {
    const form = el('form', 'converter');
    form.noValidate = true;
    form.append(el('p', 'label', 'Конвертер'));

    const amountField = el('label', 'field');
    this.amountInput = el('input', 'input');
    this.amountInput.type = 'text';
    this.amountInput.inputMode = 'decimal';
    this.amountInput.autocomplete = 'off';
    this.amountInput.value = this.amount;
    this.amountInput.setAttribute('aria-describedby', `${this.id}-amount-error`);
    amountField.append(el('span', 'field-label', 'Сумма'), this.amountInput);
    this.amountError = el('p', 'field-error');
    this.amountError.id = `${this.id}-amount-error`;
    this.amountError.setAttribute('aria-live', 'polite');

    const pair = el('div', 'converter-pair');
    this.fromSelect = el('select', 'select');
    this.toSelect = el('select', 'select');
    const fromField = el('label', 'field');
    fromField.append(el('span', 'field-label', 'Из'), this.fromSelect);
    const toField = el('label', 'field');
    toField.append(el('span', 'field-label', 'В'), this.toSelect);
    const swap = button('btn converter-swap', '⇄');
    swap.setAttribute('aria-label', 'Поменять валюты местами');
    swap.title = 'Поменять местами';
    pair.append(fromField, swap, toField);

    this.output = el('output', 'display converter-output');
    this.output.setAttribute('aria-live', 'polite');
    form.append(amountField, this.amountError, pair, this.output);

    this.listen(form, 'submit', (event) => event.preventDefault());
    this.listen(this.amountInput, 'input', () => {
      this.amount = this.amountInput.value;
      this.convert();
      this.changed();
    });
    this.listen(this.fromSelect, 'change', () => this.setPair(this.fromSelect.value, this.to));
    this.listen(this.toSelect, 'change', () => this.setPair(this.from, this.toSelect.value));
    this.listen(swap, 'click', () => this.setPair(this.to, this.from));
    return form;
  }

  mount() {
    this.load();
  }

  async load() {
    this.result.hidden = true;
    this.status.show('loading', 'Загружаем курсы ЕЦБ…');
    try {
      const { date, rates } = readRates(await this.request('rates', RATES_URL));
      this.rates = rates;
      this.showRates(date);
      this.status.show('ready');
    } catch (error) {
      if (isAbortError(error) || this.destroyed) return;
      this.rates = null;
      this.status.show('error', `Не удалось загрузить курсы. ${error.message}`);
    }
  }

  showRates(date) {
    this.caption.textContent = `Курс ЕЦБ на ${date}`;
    const codes = Object.keys(this.rates);
    const rows = codes.filter((code) => code !== BASE).map((code) => {
      const row = el('tr');
      const name = el('th');
      name.scope = 'row';
      name.append(el('span', 'rate-code', code), el('span', 'rate-name', NAMES[code]));
      row.append(name, el('td', 'rate-value', rateFormat.format(this.rates[code])));
      return row;
    });
    this.rateRows.replaceChildren(...rows);

    for (const select of [this.fromSelect, this.toSelect]) {
      select.replaceChildren(...codes.map((code) => {
        const option = el('option', '', code);
        option.value = code;
        return option;
      }));
    }
    // Если сохранённой валюты нет в ответе, берём ближайшую доступную
    const from = codes.includes(this.from) ? this.from : BASE;
    const to = codes.includes(this.to) ? this.to : codes.find((code) => code !== BASE);
    this.result.hidden = false;
    this.setPair(from, to, false);
  }

  setPair(from, to, save = true) {
    this.from = from;
    this.to = to;
    this.fromSelect.value = from;
    this.toSelect.value = to;
    this.convert();
    if (save) this.changed();
  }

  // Пересчёт через евро: сумма / курс исходной валюты * курс целевой
  convert() {
    if (!this.rates) return;
    const amount = parseAmount(this.amountInput.value);
    const valid = amount !== null;
    this.amountInput.setAttribute('aria-invalid', String(!valid));
    this.amountError.textContent = valid ? '' : 'Введите число от 0 до 1 000 000 000, например 150 или 99,5.';
    if (!valid) {
      this.output.textContent = '';
      return;
    }
    const result = (amount / this.rates[this.from]) * this.rates[this.to];
    this.output.textContent = `${moneyFormat.format(amount)} ${this.from} = ${moneyFormat.format(result)} ${this.to}`;
  }

  getState() {
    return { amount: this.amount, from: this.from, to: this.to };
  }
}
