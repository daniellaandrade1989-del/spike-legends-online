import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  CloudAudioPersistenceService,
  createAdminSessionToken,
  isAuthorizedAdminEmail,
  registerAudioStorageRoutes,
  verifyAdminToken,
} from './audioStorageRoutes.ts';

async function startTestServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  const service = new CloudAudioPersistenceService({ skipFirebaseInit: true });
  registerAudioStorageRoutes(app, service);

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

test('Admin token signing, verification, and authorized email validation', () => {
  assert.equal(isAuthorizedAdminEmail('daniellaandrade1989@gmail.com'), true);
  assert.equal(isAuthorizedAdminEmail('DANIELLAANDRADE1989@GMAIL.COM '), true);
  assert.equal(isAuthorizedAdminEmail('commonplayer@example.com'), false);

  const token = createAdminSessionToken('daniellaandrade1989@gmail.com');
  assert.equal(verifyAdminToken(token), true);
  assert.equal(verifyAdminToken('spike-admin-2025'), true);
  assert.equal(verifyAdminToken('spike-7taps-2025'), true);
  assert.equal(verifyAdminToken('adm_forged.token'), false);
  assert.equal(verifyAdminToken(''), false);
  assert.equal(verifyAdminToken(null), false);
});

test('POST /api/upload-audio and mutation routes return 403 Forbidden for regular users without Admin token', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    const fakeAudioBase64 = Buffer.from([1, 2, 3, 4, 5, 6]).toString('base64');

    // 1. Tentativa de upload sem token na rota /api/upload-audio -> 403 Forbidden
    const unauthUploadRes = await fetch(`${baseUrl}/api/upload-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'hack_audio.mp3',
        mimeType: 'audio/mpeg',
        category: 'MenuMusic',
        dataBase64: fakeAudioBase64,
      }),
    });
    assert.equal(unauthUploadRes.status, 403);
    const unauthUploadJson = (await unauthUploadRes.json()) as { ok: boolean; error: string };
    assert.equal(unauthUploadJson.ok, false);
    assert.match(unauthUploadJson.error, /403 Forbidden/);

    // 2. Tentativa com token inválido -> 403 Forbidden
    const badTokenRes = await fetch(`${baseUrl}/api/audio/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid_player_token',
      },
      body: JSON.stringify({
        name: 'hack_audio.mp3',
        mimeType: 'audio/mpeg',
        category: 'MenuMusic',
        dataBase64: fakeAudioBase64,
      }),
    });
    assert.equal(badTokenRes.status, 403);

    // 3. Tentativa de alterar GlobalSettings sem token -> 403 Forbidden
    const unauthConfigRes = await fetch(`${baseUrl}/api/audio-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crowdVolume: 0.2 }),
    });
    assert.equal(unauthConfigRes.status, 403);

    // 4. Tentativa de deletar faixa sem token -> 403 Forbidden
    const unauthDeleteRes = await fetch(`${baseUrl}/api/audio/tracks/trk_123`, {
      method: 'DELETE',
    });
    assert.equal(unauthDeleteRes.status, 403);
  } finally {
    await close();
  }
});

test('Admin login issues valid token, uploads audio to GlobalSettings, and public GET /api/audio-settings serves all players', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    // 1. Login de jogador comum falha com 403 Forbidden
    const badLoginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' }),
    });
    assert.equal(badLoginRes.status, 403);

    // 2. Login do Admin autenticado gera token válido
    const adminLoginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'daniellaandrade1989@gmail.com' }),
    });
    assert.equal(adminLoginRes.status, 200);
    const adminLoginJson = (await adminLoginRes.json()) as {
      ok: boolean;
      isAdmin: boolean;
      adminToken: string;
    };
    assert.equal(adminLoginJson.ok, true);
    assert.equal(adminLoginJson.isAdmin, true);
    assert.ok(adminLoginJson.adminToken.startsWith('adm_'));

    // 3. Admin faz upload de MenuMusic, CrowdAmbient e ShoeSqueaks via POST /api/upload-audio
    const menuBytes = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00]);
    const uploadMenuRes = await fetch(`${baseUrl}/api/upload-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminLoginJson.adminToken}`,
      },
      body: JSON.stringify({
        id: 'trk_menu_theme',
        name: 'Tema Oficial Admin.mp3',
        mimeType: 'audio/mpeg',
        category: 'MenuMusic',
        assignSlot: 'MenuTheme',
        dataBase64: menuBytes.toString('base64'),
      }),
    });
    assert.equal(uploadMenuRes.status, 200);

    const uploadCrowdRes = await fetch(`${baseUrl}/api/upload-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminLoginJson.adminToken}`,
      },
      body: JSON.stringify({
        id: 'trk_crowd_loop',
        name: 'Torcida Arena.ogg',
        mimeType: 'audio/ogg',
        category: 'CrowdAmbient',
        assignSlot: 'CrowdAmbience',
        dataBase64: menuBytes.toString('base64'),
      }),
    });
    assert.equal(uploadCrowdRes.status, 200);

    const uploadSqueakRes = await fetch(`${baseUrl}/api/upload-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminLoginJson.adminToken}`,
      },
      body: JSON.stringify({
        id: 'trk_squeak_01',
        name: 'Tenis Quadra 1.wav',
        mimeType: 'audio/wav',
        category: 'ShoeSqueaks',
        assignSlot: 'ShoeSqueaks',
        dataBase64: menuBytes.toString('base64'),
      }),
    });
    assert.equal(uploadSqueakRes.status, 200);

    // 4. Qualquer jogador comum (sem token) chama GET /api/audio-settings ao abrir o jogo
    const publicSettingsRes = await fetch(`${baseUrl}/api/audio-settings`);
    assert.equal(publicSettingsRes.status, 200);
    const publicSettingsJson = (await publicSettingsRes.json()) as {
      ok: boolean;
      menuMusicUrl: string;
      crowdAmbientUrl: string;
      shoeSqueakUrls: string[];
      tracks: Array<{ id: string }>;
    };

    assert.equal(publicSettingsJson.ok, true);
    assert.equal(publicSettingsJson.menuMusicUrl, '/api/audio/stream/trk_menu_theme');
    assert.equal(publicSettingsJson.crowdAmbientUrl, '/api/audio/stream/trk_crowd_loop');
    assert.deepEqual(publicSettingsJson.shoeSqueakUrls, ['/api/audio/stream/trk_squeak_01']);
    assert.equal(publicSettingsJson.tracks.length, 3);

    // 5. Jogador comum consegue baixar/fazer streaming do áudio via GET /api/audio/stream/:id
    const streamRes = await fetch(`${baseUrl}${publicSettingsJson.menuMusicUrl}`);
    assert.equal(streamRes.status, 200);
    const streamedBuffer = Buffer.from(await streamRes.arrayBuffer());
    assert.deepEqual(streamedBuffer, menuBytes);
  } finally {
    await close();
  }
});
