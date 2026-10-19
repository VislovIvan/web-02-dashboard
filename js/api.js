const DEFAULT_TIMEOUT = 10000;

export function isAbortError(error) {
  return error?.name === 'AbortError';
}

// fetch + JSON с таймаутом, отменой снаружи и понятными русскими ошибками
export async function fetchJSON(url, { signal, timeout = DEFAULT_TIMEOUT } = {}) {
  if (signal?.aborted) throw new DOMException('Запрос отменён', 'AbortError');

  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Сервер ответил кодом ${response.status}.`);
    return await response.json();
  } catch (error) {
    if (timedOut) throw new Error('Превышено время ожидания ответа.');
    // Отмену снаружи пробрасываем как есть: виджет её молча пропускает
    if (signal?.aborted) throw error;
    if (error instanceof SyntaxError) throw new Error('Сервер прислал повреждённый ответ.');
    if (error instanceof TypeError) {
      throw new Error(navigator.onLine === false ? 'Нет подключения к интернету.' : 'Нет сети или сервер недоступен.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
