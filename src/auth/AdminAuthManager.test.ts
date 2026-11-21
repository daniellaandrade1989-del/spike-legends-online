import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AdminAuthManager,
  DEFAULT_ADMIN_7TAP_PASSWORD,
  DEFAULT_ADMIN_URL_KEY,
} from './AdminAuthManager.ts';

test('AdminAuthManager reads adminKey from URL search, updates internal isAdmin state, and handles 7-tap fallback', async () => {
  const auth = new AdminAuthManager();
  auth.logout();

  const observedStates: boolean[] = [];
  const unsub = auth.subscribe((state) => {
    observedStates.push(state);
  });

  // Inicia como false quando não há ?adminKey
  assert.equal(auth.isAdmin(), false);
  const noKeyState = await auth.initializeFromUrl('?autostart=1');
  assert.equal(noKeyState, false);
  assert.equal(auth.isAdmin(), false);

  // Chave inválida mantém isAdmin = false
  const badKeyState = await auth.initializeFromUrl('?adminKey=wrong-key');
  assert.equal(badKeyState, false);
  assert.equal(auth.isAdmin(), false);

  // Chave secreta válida (?adminKey=spike-admin-2025) define isAdmin = true
  const validKeyState = await auth.initializeFromUrl(`?adminKey=${DEFAULT_ADMIN_URL_KEY}`);
  assert.equal(validKeyState, true);
  assert.equal(auth.isAdmin(), true);
  assert.ok(observedStates.includes(true));

  // Logout reseta isAdmin = false
  auth.logout();
  assert.equal(auth.isAdmin(), false);

  // Fallback de 7 toques em < 3s + senha secreta
  const t0 = 50_000;
  for (let i = 1; i <= 6; i++) {
    assert.equal(auth.registerVersionTap(t0 + i * 200), false);
  }
  assert.equal(auth.registerVersionTap(t0 + 7 * 200), true);

  assert.equal(await auth.authenticateWithSecretPassword('invalid-pass'), false);
  assert.equal(auth.isAdmin(), false);

  assert.equal(await auth.authenticateWithSecretPassword(DEFAULT_ADMIN_7TAP_PASSWORD), true);
  assert.equal(auth.isAdmin(), true);

  unsub();
});
