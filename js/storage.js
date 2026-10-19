const KEY = 'travel-dashboard.v1';

// status: empty (первый заход), ok, corrupt (не JSON или чужая форма), unavailable (браузер запретил)
export function loadPanel() {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return { status: 'unavailable', widgets: [] };
  }
  if (raw === null) return { status: 'empty', widgets: [] };

  try {
    const data = JSON.parse(raw);
    const valid = data !== null && typeof data === 'object' && Array.isArray(data.widgets);
    return valid ? { status: 'ok', widgets: data.widgets } : { status: 'corrupt', widgets: [] };
  } catch {
    return { status: 'corrupt', widgets: [] };
  }
}

export function savePanel(widgets) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ widgets }));
    return true;
  } catch {
    return false;
  }
}
