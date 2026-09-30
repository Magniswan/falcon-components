import test from 'node:test';
import assert from 'node:assert/strict';
import { createComponentSession } from '@falcon-components/ui';
import { createFixture, requirement, waitFor } from '../test-support/helpers.js';

test('foreground session displays a missing-component prompt and downloads only after acceptance', async (t) => {
  const fixture = await createFixture(t);
  const session = createComponentSession({ manager: fixture.manager, requirement });
  const statuses = [];
  const off = session.subscribe((state) => statuses.push(state.status));
  const first = session.start();
  assert.equal(session.start(), first);
  await waitFor(() => session.state.status === 'prompt');
  assert.equal(fixture.calls.length, 0);
  session.acceptDownload();
  const result = await first;
  assert.ok(result);
  assert.equal(session.state.status, 'ready');
  assert.ok(statuses.includes('downloading'));
  const requests = fixture.calls.length;
  await session.start();
  assert.equal(fixture.calls.length, requests);
  off();
  await session.dispose();
});

test('cancelling a foreground prompt resolves it and makes no network requests', async (t) => {
  const fixture = await createFixture(t);
  const session = createComponentSession({ manager: fixture.manager, requirement });
  const pending = session.start();
  await waitFor(() => session.state.status === 'prompt');
  session.cancel();
  assert.equal(await pending, null);
  assert.equal(session.state.status, 'cancelled');
  assert.equal(fixture.calls.length, 0);
  await session.dispose();
});

test('retry after a failed download asks again and eventually becomes ready', async (t) => {
  let failFirst = true;
  const fixture = await createFixture(t, { download: async (bytes) => { if (failFirst) { failFirst = false; throw new Error('offline'); } return bytes; } });
  const session = createComponentSession({ manager: fixture.manager, requirement });
  let pending = session.start();
  await waitFor(() => session.state.status === 'prompt');
  session.acceptDownload();
  assert.equal(await pending, null);
  assert.equal(session.state.status, 'error');
  assert.equal(session.state.errorCode, 'NETWORK_ERROR');
  pending = session.retry();
  await waitFor(() => session.state.status === 'prompt');
  session.acceptDownload();
  assert.ok(await pending);
  await session.dispose();
});

test('page disposal closes a pending prompt without updating its observers again', async (t) => {
  const fixture = await createFixture(t);
  const session = createComponentSession({ manager: fixture.manager, requirement });
  let changes = 0;
  session.subscribe(() => { changes += 1; });
  const pending = session.start();
  await waitFor(() => session.state.status === 'prompt');
  const before = changes;
  await session.dispose();
  assert.equal(await pending, null);
  assert.equal(changes, before);
  assert.equal(fixture.calls.length, 0);
  assert.equal(await session.start(), null);
});

test('the close button dismisses a finished error prompt', async (t) => {
  const fixture = await createFixture(t, { download: async () => { throw new Error('offline'); } });
  const session = createComponentSession({ manager: fixture.manager, requirement });
  const pending = session.start();
  await waitFor(() => session.state.status === 'prompt');
  session.acceptDownload();
  await pending;
  assert.equal(session.state.status, 'error');
  session.cancel();
  assert.equal(session.state.status, 'cancelled');
  await session.dispose();
});

test('a broken foreground observer cannot approve or break an installation', async (t) => {
  const fixture = await createFixture(t);
  const session = createComponentSession({ manager: fixture.manager, requirement });
  session.subscribe(() => { throw new Error('UI callback'); });
  const pending = session.start();
  await waitFor(() => session.state.status === 'prompt');
  session.acceptDownload();
  assert.ok(await pending);
  await session.dispose();
});
