import { isAbortError } from './api.js';
import { el, formatClock } from './dom.js';
import { UIComponent } from './UIComponent.js';

const CITIES = {
  spb: { name: 'Санкт-Петербург', latitude: 59.94, longitude: 30.31 },
  naples: { name: 'Неаполь', latitude: 40.85, longitude: 14.27 },
  moscow: { name: 'Москва', latitude: 55.76, longitude: 37.62 },
  kazan: { name: 'Казань', latitude: 55.79, longitude: 49.12 },
  kaliningrad: { name: 'Калининград', latitude: 54.71, longitude: 20.51 },
  sochi: { name: 'Сочи', latitude: 43.6, longitude: 39.73 },
};
const DEFAULT_CITY = 'naples';

// Коды погоды WMO из ответа Open-Meteo
const WEATHER_CODES = {
  0: 'Ясно',
  1: 'Преимущественно ясно',
  2: 'Переменная облачность',
  3: 'Пасмурно',
  45: 'Туман',
  48: 'Туман с изморозью',
  51: 'Слабая морось',
  53: 'Морось',
  55: 'Сильная морось',
  56: 'Слабая ледяная морось',
  57: 'Ледяная морось',
  61: 'Небольшой дождь',
  63: 'Дождь',
  65: 'Сильный дождь',
  66: 'Ледяной дождь',
  67: 'Сильный ледяной дождь',
  71: 'Небольшой снег',
  73: 'Снег',
  75: 'Сильный снег',
  77: 'Снежные зёрна',
  80: 'Небольшой ливень',
  81: 'Ливень',
  82: 'Сильный ливень',
  85: 'Небольшой снегопад',
  86: 'Сильный снегопад',
  95: 'Гроза',
  96: 'Гроза с градом',
  99: 'Гроза с сильным градом',
};

// Единицы приходят в current_units по-английски
const UNITS = { 'km/h': 'км/ч', 'm/s': 'м/с', mph: 'миль/ч', kn: 'уз' };

const temperature = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0, signDisplay: 'exceptZero' });
const dayName = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });

function forecastUrl({ latitude, longitude }) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code',
    timezone: 'auto',
    forecast_days: '3',
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

const describe = (code) => WEATHER_CODES[code] ?? `Код погоды ${code}`;
const unit = (value) => UNITS[value] ?? value ?? '';
const withUnit = (value, units) => `${value} ${unit(units)}`;

function dayLabel(isoDate, index) {
  if (index === 0) return 'Сегодня';
  if (index === 1) return 'Завтра';
  return dayName.format(new Date(`${isoDate}T00:00:00Z`));
}

// Проверяем форму ответа, прежде чем что-то показывать
function readForecast(data) {
  const { current, current_units: units, daily, daily_units: dailyUnits } = data ?? {};
  const fields = ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'wind_speed_10m', 'weather_code'];
  const days = ['time', 'temperature_2m_max', 'temperature_2m_min', 'weather_code'];
  if (!units || !dailyUnits || !fields.every((key) => typeof current?.[key] === 'number') || !days.every((key) => Array.isArray(daily?.[key]))) {
    throw new Error('Сервис погоды прислал неполные данные.');
  }
  return { current, units, daily, dailyUnits };
}

export class WeatherWidget extends UIComponent {
  static type = 'weather';

  constructor(id, title, options = {}) {
    super(id, title, options);
    const city = options.state?.city;
    this.city = Object.hasOwn(CITIES, city) ? city : DEFAULT_CITY;
  }

  renderBody(body) {
    const field = el('label', 'field weather-city');
    field.append(el('span', 'field-label', 'Город'));
    this.select = el('select', 'select');
    for (const [key, { name }] of Object.entries(CITIES)) {
      const option = el('option', '', name);
      option.value = key;
      this.select.append(option);
    }
    this.select.value = this.city;
    field.append(this.select);

    this.status = this.createStatus(() => this.load());
    this.result = el('div', 'weather-result');
    this.result.hidden = true;
    body.append(field, this.status.element, this.result);

    this.listen(this.select, 'change', () => {
      this.city = this.select.value;
      this.changed();
      this.load();
    });
  }

  mount() {
    this.load();
  }

  async load() {
    const city = CITIES[this.city];
    this.result.hidden = true;
    this.status.show('loading', `Загружаем погоду: ${city.name}…`);
    try {
      const forecast = readForecast(await this.request('forecast', forecastUrl(city)));
      this.showForecast(forecast);
      this.status.show('ready');
    } catch (error) {
      if (isAbortError(error) || this.destroyed) return;
      this.status.show('error', `Не удалось загрузить погоду. ${error.message}`);
    }
  }

  showForecast({ current, units, daily, dailyUnits }) {
    const now = el('div', 'weather-now');
    now.append(
      el('p', 'display weather-temp', withUnit(temperature.format(current.temperature_2m), units.temperature_2m)),
      el('p', 'weather-desc', describe(current.weather_code)),
    );

    const facts = el('dl', 'facts');
    const addFact = (term, value) => {
      const item = el('div');
      item.append(el('dt', 'label', term), el('dd', '', value));
      facts.append(item);
    };
    addFact('Ощущается', withUnit(temperature.format(current.apparent_temperature), units.apparent_temperature));
    addFact('Ветер', withUnit(Math.round(current.wind_speed_10m), units.wind_speed_10m));
    addFact('Влажность', withUnit(current.relative_humidity_2m, units.relative_humidity_2m));

    const days = el('ul', 'forecast');
    daily.time.slice(0, 3).forEach((date, index) => {
      const max = temperature.format(daily.temperature_2m_max[index]);
      const min = temperature.format(daily.temperature_2m_min[index]);
      const item = el('li', 'forecast-day');
      item.append(
        el('span', 'forecast-name', dayLabel(date, index)),
        el('span', 'forecast-desc', describe(daily.weather_code[index])),
        el('span', 'forecast-temp', `от ${min} до ${withUnit(max, dailyUnits.temperature_2m_max)}`),
      );
      days.append(item);
    });

    const updated = el('p', 'updated', `Обновлено в ${formatClock(new Date())}`);
    this.result.replaceChildren(now, facts, days, updated);
    this.result.hidden = false;
  }

  getState() {
    return { city: this.city };
  }
}
