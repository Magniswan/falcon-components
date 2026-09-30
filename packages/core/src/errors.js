export class ComponentError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'ComponentError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

export function fail(code, message) {
  throw new ComponentError(code, message);
}

export function createCancellationToken() {
  let cancelled = false;
  const handlers = new Set();
  return {
    get cancelled() { return cancelled; },
    throwIfCancelled() {
      if (cancelled) fail('CANCELLED', '操作已取消');
    },
    onCancel(handler) {
      if (cancelled) { handler(); return () => {}; }
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      for (const handler of handlers) {
        try { handler(); } catch (_) { /* Cancellation must notify every listener. */ }
      }
      handlers.clear();
    },
  };
}
