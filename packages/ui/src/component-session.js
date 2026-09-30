import { createCancellationToken, errorMessage, validateRequirement } from '@falcon-components/core';

export function createComponentSession({ manager, requirement, context = {} }) {
  const wanted = validateRequirement(requirement);
  let state = { status: 'idle', name: wanted.name, received: 0, total: 0, message: '', errorCode: '' };
  const listeners = new Set();
  let token;
  let generation = 0;
  let decide;
  let handle;
  let running;
  let disposed = false;
  function emit(changes) {
    state = { ...state, ...changes };
    for (const listener of listeners) {
      try { listener({ ...state }); } catch (_) { /* A UI observer cannot break an installation. */ }
    }
  }
  function cancelPending() {
    if (token) token.cancel();
    if (decide) { const pending = decide; decide = null; pending(false); }
  }
  const session = {
    get state() { return { ...state }; },
    get component() { return handle ? handle.instance : null; },
    subscribe(listener) {
      listeners.add(listener);
      try { listener({ ...state }); } catch (_) {}
      return () => listeners.delete(listener);
    },
    start() {
      if (disposed) return Promise.resolve(null);
      if (running) return running;
      if (handle) return Promise.resolve(handle);
      const current = ++generation;
      const currentToken = createCancellationToken();
      token = currentToken;
      emit({ status: 'checking', received: 0, total: 0, message: '', errorCode: '' });
      const operation = manager.load(wanted, {
        context, token: currentToken,
        requestDownload: () => new Promise((resolve) => {
          if (disposed || current !== generation || currentToken.cancelled) { resolve(false); return; }
          decide = resolve;
          emit({ status: 'prompt', message: '此功能需要下载组件，下载后可离线使用。' });
        }),
        onProgress(progress) {
          if (!disposed && current === generation) emit({ status: 'downloading', ...progress, message: '' });
        },
      }).then(async (loaded) => {
        if (disposed || current !== generation || currentToken.cancelled) { await loaded.dispose(); return null; }
        handle = loaded;
        emit({ status: 'ready', message: '' });
        return handle;
      }).catch((error) => {
        if (!disposed && current === generation) emit({ status: error.code === 'CANCELLED' ? 'cancelled' : 'error', message: errorMessage(error), errorCode: error.code || 'UNKNOWN' });
        return null;
      }).finally(() => {
        if (current === generation) { running = null; decide = null; }
      });
      running = operation;
      return operation;
    },
    acceptDownload() {
      if (!decide || disposed) return;
      const pending = decide;
      decide = null;
      emit({ status: 'downloading', message: '正在获取组件信息…' });
      pending(true);
    },
    cancel() {
      if (disposed || handle) return;
      if (!running) {
        if (state.status === 'error') emit({ status: 'cancelled', message: '已关闭提示', errorCode: '' });
        return;
      }
      cancelPending();
      emit({ status: 'cancelled', message: '已取消下载', errorCode: 'CANCELLED' });
    },
    retry() { return session.start(); },
    async dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      cancelPending();
      listeners.clear();
      if (handle) { const existing = handle; handle = null; await existing.dispose(); }
      // Any late-created instance is disposed by the operation's generation check.
      if (running) await running;
    },
  };
  return session;
}
