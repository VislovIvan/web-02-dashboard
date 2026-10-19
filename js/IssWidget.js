import { isAbortError } from './api.js';
import { el, formatClock, plural } from './dom.js';
import { UIComponent } from './UIComponent.js';
import { LAT_BOTTOM, LAT_TOP, WORLD_COLS, WORLD_ROWS, decodeLand } from './worldmap.js';

const POSITION_URL = 'https://api.wheretheiss.at/v1/satellites/25544';
const CREW_URL = 'https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json';
const REFRESH_MS = 10000;
const TRAIL_LENGTH = 30;
const LAND = decodeLand();

const ROLES = { Commander: 'командир', 'Flight Engineer': 'бортинженер', Pilot: 'пилот' };
const VISIBILITY = { daylight: 'МКС над освещённой стороной Земли.', eclipsed: 'МКС в тени Земли.' };

const degrees = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

const latitudeText = (value) => `${degrees.format(Math.abs(value))}°\u00a0${value >= 0 ? 'с.\u00a0ш.' : 'ю.\u00a0ш.'}`;
const longitudeText = (value) => `${degrees.format(Math.abs(value))}°\u00a0${value >= 0 ? 'в.\u00a0д.' : 'з.\u00a0д.'}`;

function readPosition(data) {
  const { latitude, longitude, altitude, velocity, timestamp } = data ?? {};
  if (![latitude, longitude, altitude, velocity].every(Number.isFinite)) {
    throw new Error('Сервис прислал неполные данные о положении.');
  }
  const miles = data.units === 'miles';
  return {
    latitude,
    longitude,
    altitude: `${whole.format(altitude)}\u00a0${miles ? 'миль' : 'км'}`,
    velocity: `${whole.format(velocity)}\u00a0${miles ? 'миль/ч' : 'км/ч'}`,
    visibility: VISIBILITY[data.visibility] ?? '',
    time: Number.isFinite(timestamp) ? new Date(timestamp * 1000) : new Date(),
  };
}

function readCrew(data) {
  if (!Array.isArray(data?.people)) throw new Error('Сервис прислал неполные данные об экипаже.');
  const onBoard = data.people.filter((person) => person?.iss === true && typeof person.name === 'string');
  const total = Number.isInteger(data.number) ? data.number : data.people.length;
  return { onBoard, total, expedition: Number.isInteger(data.iss_expedition) ? data.iss_expedition : null };
}

export class IssWidget extends UIComponent {
  static type = 'iss';

  constructor(id, title, options = {}) {
    super(id, title, options);
    this.position = null;
    this.trail = [];
    this.pollId = 0;
    this.crewRequested = false;
  }

  renderBody(body) {
    this.element.classList.add('widget-wide');

    const frame = el('div', 'iss-map');
    this.canvas = el('canvas');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Карта мира: положение МКС ещё не получено');
    frame.append(this.canvas);

    this.positionStatus = this.createStatus(() => this.loadPosition(true));
    this.positionBox = el('div', 'iss-position');
    this.positionBox.hidden = true;
    const facts = el('dl', 'facts facts-four');
    this.values = {};
    for (const [key, term] of [['latitude', 'Широта'], ['longitude', 'Долгота'], ['altitude', 'Высота'], ['velocity', 'Скорость']]) {
      const item = el('div');
      this.values[key] = el('dd');
      item.append(el('dt', 'label', term), this.values[key]);
      facts.append(item);
    }
    this.visibility = el('p', 'iss-visibility');
    this.updated = el('p', 'updated');
    this.positionBox.append(facts, this.visibility, this.updated);

    const crew = el('section', 'iss-crew');
    crew.append(el('h3', 'label', 'Экипаж МКС'));
    this.crewStatus = this.createStatus(() => this.loadCrew());
    this.crewBox = el('div', 'iss-crew-box');
    this.crewBox.hidden = true;
    crew.append(this.crewStatus.element, this.crewBox);

    body.append(frame, this.positionStatus.element, this.positionBox, crew);
  }

  mount() {
    this.listen(document, 'visibilitychange', () => this.syncPolling());
    const observer = new ResizeObserver(() => this.drawMap());
    observer.observe(this.canvas);
    this.addCleanup(() => observer.disconnect());
    this.syncPolling();
    if (!this.collapsed) this.loadCrew();
  }

  // Опрос идёт, только пока окно развёрнуто и вкладка на экране
  syncPolling() {
    const active = !this.collapsed && !document.hidden;
    if (active && !this.pollId) {
      this.loadPosition();
      this.pollId = this.startInterval(() => this.loadPosition(false), REFRESH_MS);
    } else if (!active && this.pollId) {
      this.stopInterval(this.pollId);
      this.pollId = 0;
      this.cancelRequest('position');
    }
  }

  onCollapsedChange(collapsed) {
    this.syncPolling();
    if (!collapsed && !this.crewRequested) this.loadCrew();
  }

  async loadPosition(showLoading = !this.position) {
    if (showLoading) this.positionStatus.show('loading', 'Определяем, где сейчас МКС…');
    try {
      this.position = readPosition(await this.request('position', POSITION_URL, { timeout: 8000 }));
      this.trail.push(this.position);
      if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
      this.showPosition();
      this.positionStatus.show('ready');
    } catch (error) {
      if (isAbortError(error) || this.destroyed) return;
      // Старое положение не выдаём за текущее
      this.position = null;
      this.positionBox.hidden = true;
      this.canvas.setAttribute('aria-label', 'Карта мира: положение МКС не получено');
      this.drawMap();
      this.positionStatus.show('error', `Не удалось получить положение МКС. ${error.message}`);
    }
  }

  showPosition() {
    const { latitude, longitude, altitude, velocity, visibility, time } = this.position;
    this.values.latitude.textContent = latitudeText(latitude);
    this.values.longitude.textContent = longitudeText(longitude);
    this.values.altitude.textContent = altitude;
    this.values.velocity.textContent = velocity;
    this.visibility.textContent = visibility;
    this.updated.textContent = `Обновлено в ${formatClock(time, true)}. Автообновление раз в 10 секунд.`;
    this.canvas.setAttribute('aria-label', `Карта мира: МКС над точкой ${latitudeText(latitude)}, ${longitudeText(longitude)}`);
    this.positionBox.hidden = false;
    this.drawMap();
  }

  async loadCrew() {
    this.crewRequested = true;
    this.crewBox.hidden = true;
    this.crewStatus.show('loading', 'Загружаем экипаж…');
    try {
      this.showCrew(readCrew(await this.request('crew', CREW_URL)));
      this.crewStatus.show('ready');
    } catch (error) {
      if (isAbortError(error) || this.destroyed) return;
      this.crewRequested = false;
      this.crewStatus.show('error', `Не удалось загрузить экипаж. ${error.message}`);
    }
  }

  showCrew({ onBoard, total, expedition }) {
    const count = onBoard.length;
    let summary = `На МКС ${count} ${plural(count, 'человек', 'человека', 'человек')}, всего в космосе ${total}.`;
    if (expedition) summary += ` Экспедиция ${expedition}.`;

    const list = el('ul', 'crew-list');
    for (const person of onBoard) {
      const details = [person.agency, ROLES[person.position]].filter((part) => typeof part === 'string' && part);
      const item = el('li');
      item.append(el('span', 'crew-name', person.name), el('span', 'crew-meta', details.join(', ')));
      list.append(item);
    }
    this.crewBox.replaceChildren(el('p', 'crew-summary', summary), list);
    this.crewBox.hidden = false;
  }

  // Карта из точек: клетка суши = квадратная точка, МКС = квадрат с рамкой
  drawMap() {
    const width = this.canvas.clientWidth;
    if (!width) return;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(width * ratio);
    const h = Math.round(((width * WORLD_ROWS) / WORLD_COLS) * ratio);
    this.canvas.width = w;
    this.canvas.height = h;

    const ctx = this.canvas.getContext('2d');
    const styles = getComputedStyle(this.canvas);
    const color = (name) => styles.getPropertyValue(name).trim();
    const cell = w / WORLD_COLS;
    const dot = Math.max(1, Math.round(cell * 0.5));
    const offset = (cell - dot) / 2;

    ctx.fillStyle = color('--text-faint');
    for (let row = 0; row < WORLD_ROWS; row++) {
      for (let col = 0; col < WORLD_COLS; col++) {
        if (LAND[row * WORLD_COLS + col]) {
          ctx.fillRect(Math.round(col * cell + offset), Math.round(row * cell + offset), dot, dot);
        }
      }
    }
    if (!this.position) return;

    const project = ({ latitude, longitude }) => [
      ((longitude + 180) / 360) * w,
      ((LAT_TOP - latitude) / (LAT_TOP - LAT_BOTTOM)) * h,
    ];
    ctx.fillStyle = color('--accent');
    for (const point of this.trail.slice(0, -1)) {
      const [x, y] = project(point);
      ctx.fillRect(Math.round(x - dot / 2), Math.round(y - dot / 2), dot, dot);
    }

    const [x, y] = project(this.position);
    const size = Math.round(cell * 3);
    const border = Math.max(2, Math.round(ratio * 2));
    const left = Math.round(x - size / 2);
    const top = Math.round(y - size / 2);
    ctx.fillStyle = color('--ink-line');
    ctx.fillRect(left - border, top - border, size + border * 2, size + border * 2);
    ctx.fillStyle = color('--accent');
    ctx.fillRect(left, top, size, size);
  }
}
