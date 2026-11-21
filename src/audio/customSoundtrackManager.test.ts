import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arenaToStageSlot,
  CustomSoundtrackManager,
  isSupportedAudioFormat,
  resolveSceneAudioSlot,
  type RemoteAudioConfigPayload,
  type RemoteAudioSyncAdapter,
  type SoundtrackAudioBridge,
} from './customSoundtrackManager.ts';

function createMockBridge() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const bridge: SoundtrackAudioBridge = {
    ensureMusicBus: () => null, // headless unit test without Web Audio API
    startProceduralWithFade: (track, fadeInSec) => calls.push({ method: 'startProceduralWithFade', args: [track, fadeInSec] }),
    stopProceduralWithFade: (fadeOutSec) => calls.push({ method: 'stopProceduralWithFade', args: [fadeOutSec] }),
    setCrowdForSlot: (isMatchSlot) => calls.push({ method: 'setCrowdForSlot', args: [isMatchSlot] }),
    destroyDefaultMusic: (keepCrowd) => calls.push({ method: 'destroyDefaultMusic', args: [keepCrowd] }),
    setCustomExclusiveMode: (active) => calls.push({ method: 'setCustomExclusiveMode', args: [active] }),
  };
  return { bridge, calls };
}

test('isSupportedAudioFormat validates .mp3, .wav, and .ogg while rejecting other files', () => {
  assert.equal(isSupportedAudioFormat('tema_anime.mp3', 'audio/mpeg'), true);
  assert.equal(isSupportedAudioFormat('praia_bgm.WAV', 'audio/wav'), true);
  assert.equal(isSupportedAudioFormat('final_match.ogg', 'audio/ogg'), true);
  assert.equal(isSupportedAudioFormat('capa.png', 'image/png'), false);
  assert.equal(isSupportedAudioFormat('notas.txt', 'text/plain'), false);
});

test('arenaToStageSlot and resolveSceneAudioSlot map arenas to Stage1_BGM..Stage7_BGM and menus to MenuTheme', () => {
  assert.equal(arenaToStageSlot('ginasio'), 'Stage1_BGM');
  assert.equal(arenaToStageSlot('praia'), 'Stage2_BGM');
  assert.equal(arenaToStageSlot('escola'), 'Stage3_BGM');
  assert.equal(arenaToStageSlot('neon'), 'Stage4_BGM');
  assert.equal(arenaToStageSlot('montanha'), 'Stage5_BGM');
  assert.equal(arenaToStageSlot('templo'), 'Stage6_BGM');
  assert.equal(arenaToStageSlot('festival'), 'Stage7_BGM');

  assert.equal(resolveSceneAudioSlot('title', 'ginasio'), 'MenuTheme');
  assert.equal(resolveSceneAudioSlot('menu', 'praia'), 'MenuTheme');
  assert.equal(resolveSceneAudioSlot('playing', 'praia'), 'Stage2_BGM');
  assert.equal(resolveSceneAudioSlot('paused', 'neon'), 'Stage4_BGM');
});

test('CustomSoundtrackManager handles track uploads, slot assignments, fade out/in transitions, and exclusive custom playback', async () => {
  const { bridge, calls } = createMockBridge();
  const manager = new CustomSoundtrackManager(bridge);
  manager.setFadeDuration(0.75, 0.85);

  const buf1 = new Uint8Array([1, 2, 3, 4]).buffer;
  const buf2 = new Uint8Array([5, 6, 7, 8]).buffer;

  const menuTrack = await manager.uploadTrackFromBuffer('opening_anime.mp3', 'audio/mpeg', buf1);
  const stageTrack = await manager.uploadTrackFromBuffer('beach_rally.ogg', 'audio/ogg', buf2);

  await assert.rejects(
    () => manager.uploadTrackFromBuffer('invalido.pdf', 'application/pdf', buf1),
    /Formato não suportado/,
  );

  manager.assignTrackToSlot('MenuTheme', menuTrack.id);
  manager.assignTrackToSlot('Stage2_BGM', stageTrack.id);

  // Entra no MenuTheme -> destrói música padrão e usa trilha customizada com Fade In
  const tMenu = await manager.transitionToSlot('MenuTheme');
  assert.equal(tMenu.mode, 'custom');
  assert.equal(tMenu.toSlot, 'MenuTheme');
  assert.equal(tMenu.trackId, menuTrack.id);
  assert.equal(tMenu.fadeInSec, 0.85);
  assert.ok(calls.some((c) => c.method === 'setCustomExclusiveMode' && c.args[0] === true));
  assert.ok(calls.some((c) => c.method === 'destroyDefaultMusic'));

  // Muda para Stage2_BGM (Praia) -> Fade Out da faixa anterior + Fade In da faixa do estágio
  const tStage2 = await manager.transitionToSlot('Stage2_BGM');
  assert.equal(tStage2.fromSlot, 'MenuTheme');
  assert.equal(tStage2.toSlot, 'Stage2_BGM');
  assert.equal(tStage2.mode, 'custom');
  assert.equal(tStage2.trackId, stageTrack.id);
  assert.equal(tStage2.fadeOutSec, 0.75);
  assert.equal(tStage2.fadeInSec, 0.85);
  assert.ok(calls.some((c) => c.method === 'stopProceduralWithFade' && c.args[0] === 0.75));
  assert.ok(calls.some((c) => c.method === 'setCrowdForSlot' && c.args[0] === true));

  // Muda para Stage4_BGM (sem trilha customizada vinculada) -> fallback procedural com Fade In
  const tStage4 = await manager.transitionToSlot('Stage4_BGM');
  assert.equal(tStage4.mode, 'procedural');
  assert.equal(tStage4.trackId, null);
  assert.ok(calls.some((c) => c.method === 'startProceduralWithFade' && c.args[0] === 'match' && c.args[1] === 0.85));

  // Excluir faixa remove vínculo automaticamente
  await manager.deleteTrack(stageTrack.id);
  assert.equal(manager.hasTrackForSlot('Stage2_BGM'), false);
  assert.equal(manager.getState().tracks.length, 1);

  // Partidas silenciam imediatamente toda BGM (audioSource.Stop() / StopMatchBackgroundMusic()) mantendo apenas SFX e ambiência
  const matchTransition = await manager.transitionToScene('playing', 'praia');
  assert.equal(matchTransition.toSlot, 'Stage2_BGM');
  assert.equal(matchTransition.trackId, null);
  assert.equal(manager.getStatus().activeSlot, null);
  assert.equal(manager.getStatus().isPlayingCustom, false);
});

test('CustomSoundtrackManager assigns multi-clip ShoeSqueaks SFX and plays with randomized pitch variation', async () => {
  const { bridge } = createMockBridge();
  const playedSources: Array<{ playbackRate: number; volume: number }> = [];
  const fakeBuffer = { duration: 0.15 } as unknown as AudioBuffer;
  const fakeCtx = {
    currentTime: 10,
    destination: {},
    decodeAudioData: async () => fakeBuffer,
    createBufferSource: () => {
      const state = { playbackRate: 1, started: false };
      return {
        buffer: null as AudioBuffer | null,
        playbackRate: {
          setValueAtTime: (val: number) => {
            state.playbackRate = val;
          },
        },
        connect: (node: { gain: { value: number } }) => ({
          connect: () => {
            playedSources.push({ playbackRate: state.playbackRate, volume: node.gain.value });
          },
        }),
        start: () => {
          state.started = true;
        },
      };
    },
    createGain: () => {
      const gainObj = { value: 1 };
      return {
        gain: {
          setValueAtTime: (val: number) => {
            gainObj.value = val;
          },
          get value() {
            return gainObj.value;
          },
        },
        connect: () => {},
      };
    },
  } as unknown as AudioContext;

  bridge.getSfxPlaybackContext = () => ({ ctx: fakeCtx, sfxGain: 0.8 });

  const seq = [0.1, 0.2, 0.85, 0.9];
  let idx = 0;
  const manager = new CustomSoundtrackManager(bridge, undefined, () => seq[idx++ % seq.length]);

  const rawBuf = new Uint8Array([1, 2, 3, 4]).buffer;
  const squeakA = await manager.uploadTrackFromBuffer('squeak_1.wav', 'audio/wav', rawBuf);
  const squeakB = await manager.uploadTrackFromBuffer('squeak_2.wav', 'audio/wav', rawBuf);

  manager.assignSfxTrack('ShoeSqueaks', squeakA.id, 'toggle');
  manager.assignSfxTrack('ShoeSqueaks', squeakB.id, 'toggle');
  assert.equal(manager.hasCustomSfxForSlot('ShoeSqueaks'), true);
  assert.deepEqual(manager.getAssignedSfxTrackIds('ShoeSqueaks'), [squeakA.id, squeakB.id]);

  // Aguarda decodificação assíncrona do cache iniciada na atribuição
  await new Promise((r) => setTimeout(r, 10));

  // Em estado de Menu ('title' / 'menu'), ShoeSqueaks deve ser bloqueado
  assert.equal(manager.playCustomSfx('ShoeSqueaks', { intensity: 0.9, isHardStop: false }), false);

  // Ativa estado de partida ('playing') para permitir SFX de quadra
  manager.setScreenState('playing');
  const ok1 = manager.playCustomSfx('ShoeSqueaks', { intensity: 0.9, isHardStop: false });
  const ok2 = manager.playCustomSfx('ShoeSqueaks', { intensity: 0.9, isHardStop: false });
  assert.equal(ok1, true);
  assert.equal(ok2, true);
  assert.equal(playedSources.length, 2);
  assert.notEqual(playedSources[0].playbackRate, playedSources[1].playbackRate, 'Pitch must randomize across squeak steps');
  assert.ok(playedSources[0].playbackRate >= 0.85 && playedSources[0].playbackRate <= 1.18);
  assert.ok(playedSources[1].playbackRate >= 0.85 && playedSources[1].playbackRate <= 1.18);

  // Deletar faixa limpa automaticamente sfxAssignments
  await manager.deleteTrack(squeakA.id);
  assert.deepEqual(manager.getAssignedSfxTrackIds('ShoeSqueaks'), [squeakB.id]);
});

test('Shoe squeak randomizer never repeats immediately and modulates pitch strictly within 0.9..1.1', async () => {
  const {
    SHOE_SQUEAK_CLIPS,
    selectRandomShoeSqueakClipIndex,
    computeShoeSqueakPitch,
  } = await import('./soundEngine.ts');

  assert.ok(SHOE_SQUEAK_CLIPS.length >= 4, 'Must define an array of multiple shoe squeak variations');

  let prev = -1;
  // Mesmo com rng constante tentando escolher o mesmo índice repetido, o randomizer deve trocar de som
  for (let i = 0; i < 12; i++) {
    const picked = selectRandomShoeSqueakClipIndex(SHOE_SQUEAK_CLIPS.length, prev, () => 0.25);
    assert.notEqual(picked, prev, 'Shoe squeak randomizer must never repeat the previous clip back-to-back');
    assert.ok(picked >= 0 && picked < SHOE_SQUEAK_CLIPS.length);
    prev = picked;
  }

  assert.equal(computeShoeSqueakPitch(0.9, 1.1, () => 0), 0.9);
  assert.equal(computeShoeSqueakPitch(0.9, 1.1, () => 0.5), 1.0);
  assert.equal(computeShoeSqueakPitch(0.9, 1.1, () => 1), 1.1);
  assert.equal(computeShoeSqueakPitch(undefined, undefined, () => 0), 0.85);
  assert.equal(computeShoeSqueakPitch(undefined, undefined, () => 1), 1.15);
});

test('CustomSoundtrackManager.ShoeSqueakSounds stores multi-format samples and PlayRandomShoeSqueak modulates pitch within 0.85..1.15', async () => {
  const { bridge } = createMockBridge();
  const playedSources: Array<{ playbackRate: number; volume: number; loop: boolean }> = [];
  const fakeBuffer = { duration: 0.12 } as unknown as AudioBuffer;
  const fakeCtx = {
    currentTime: 5,
    destination: {},
    decodeAudioData: async () => fakeBuffer,
    createBufferSource: () => {
      const state = { playbackRate: 1, loop: true };
      const node = {
        buffer: null as AudioBuffer | null,
        get loop() {
          return state.loop;
        },
        set loop(val: boolean) {
          state.loop = val;
        },
        playbackRate: {
          setValueAtTime: (val: number) => {
            state.playbackRate = val;
          },
        },
        connect: (gainNode: { gain: { value: number } }) => ({
          connect: () => {
            playedSources.push({
              playbackRate: state.playbackRate,
              volume: gainNode.gain.value,
              loop: state.loop,
            });
          },
        }),
        start: () => {},
        stop: () => {},
        disconnect: () => {},
        onended: null as (() => void) | null,
      };
      return node;
    },
    createGain: () => {
      const gainObj = { value: 1 };
      return {
        gain: {
          setValueAtTime: (val: number) => {
            gainObj.value = val;
          },
          get value() {
            return gainObj.value;
          },
        },
        connect: () => {},
      };
    },
  } as unknown as AudioContext;

  bridge.getSfxPlaybackContext = () => ({ ctx: fakeCtx, sfxGain: 0.9 });

  const rngSeq = [0.0, 0.0, 0.0, 0.99, 0.5, 0.5];
  let i = 0;
  const manager = new CustomSoundtrackManager(bridge, undefined, () => rngSeq[i++ % rngSeq.length]);
  const buf = new Uint8Array([1, 2, 3, 4]).buffer;

  await manager.uploadShoeSqueakFromBuffers([
    { name: 'tenis_1.mp3', mimeType: 'audio/mpeg', buffer: buf },
    { name: 'tenis_2.wav', mimeType: 'audio/wav', buffer: buf },
    { name: 'tenis_3.ogg', mimeType: 'audio/ogg', buffer: buf },
  ]);

  assert.equal(manager.ShoeSqueakSounds.length, 3);
  assert.equal(manager.hasTrackForSlot('MenuTheme'), false);

  await new Promise((r) => setTimeout(r, 10));

  // TRAVA 2: Enquanto estiver no Menu ('title' ou 'menu'), PlayRandomShoeSqueak retorna false imediatamente
  manager.setScreenState('menu');
  assert.equal(manager.PlayRandomShoeSqueak({ intensity: 0.9, isHardStop: true }), false);
  assert.equal(playedSources.length, 0);

  // Entra na partida ('playing') -> agora permite tocar com loop = false
  manager.setScreenState('playing');
  const ok1 = manager.PlayRandomShoeSqueak({ intensity: 0.9, isHardStop: true });
  const firstId = manager.getLastCustomSfxEvent()?.trackId;
  const ok2 = manager.PlayRandomShoeSqueak({ intensity: 0.9, isHardStop: false });
  const secondId = manager.getLastCustomSfxEvent()?.trackId;

  assert.equal(ok1, true);
  assert.equal(ok2, true);
  assert.notEqual(firstId, secondId, 'PlayRandomShoeSqueak must pick a different sample back-to-back');
  assert.equal(playedSources.length, 2);
  // TRAVA 1: Verifica que shoeSqueakSource.loop é estritamente false
  assert.equal(playedSources[0].loop, false);
  assert.equal(playedSources[1].loop, false);
  assert.equal(manager.getShoeSqueakSource()?.loop, false);
  assert.ok(playedSources[0].playbackRate >= 0.85 && playedSources[0].playbackRate <= 1.15);
  assert.ok(playedSources[1].playbackRate >= 0.85 && playedSources[1].playbackRate <= 1.15);
});

test('Safety Locks: StopAllGameplaySounds stops shoeSqueakSource + crowd and sanitizes RANGER DE TENIS from MenuTheme', async () => {
  const { bridge, calls } = createMockBridge();
  let stoppedCount = 0;
  const fakeBuffer = { duration: 0.25 } as unknown as AudioBuffer;
  const fakeCtx = {
    currentTime: 2,
    destination: {},
    decodeAudioData: async () => fakeBuffer,
    createBufferSource: () => ({
      buffer: null as AudioBuffer | null,
      loop: true,
      playbackRate: { setValueAtTime: () => {} },
      connect: () => ({ connect: () => {} }),
      start: () => {},
      stop: () => {
        stoppedCount += 1;
      },
      disconnect: () => {},
      onended: null as (() => void) | null,
    }),
    createGain: () => ({
      gain: {
        value: 1,
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        cancelScheduledValues: () => {},
      },
      connect: () => ({}),
      disconnect: () => {},
    }),
  } as unknown as AudioContext;

  bridge.getSfxPlaybackContext = () => ({ ctx: fakeCtx, sfxGain: 0.9 });

  const manager = new CustomSoundtrackManager(bridge);
  const sampleBuf = new Uint8Array([9, 8, 7, 6]).buffer;

  // Simula o upload de "RANGER DE TENIS NA QUADRA 08.wav" tentando vinculá-lo a MenuTheme por engano
  const rangerTrack = await manager.uploadTrackFromBuffer(
    'RANGER DE TENIS NA QUADRA 08.wav',
    'audio/wav',
    sampleBuf,
    { category: 'MenuMusic', assignSlot: 'MenuTheme' },
  );

  // Deve ter sido automaticamente classificado como ShoeSqueaks e bloqueado do MenuTheme!
  assert.equal(rangerTrack.category, 'ShoeSqueaks');
  assert.equal(manager.hasTrackForSlot('MenuTheme'), false);
  assert.ok(manager.getAssignedSfxTrackIds('ShoeSqueaks').includes(rangerTrack.id));

  await new Promise((r) => setTimeout(r, 10));

  // Em partida ('playing'), toca o som de tênis com loop = false
  manager.setScreenState('playing');
  const played = manager.PlayRandomShoeSqueak({ intensity: 1.0, isHardStop: true });
  assert.equal(played, true);
  assert.notEqual(manager.getShoeSqueakSource(), null);
  assert.equal(manager.getShoeSqueakSource()?.loop, false);

  // TRAVA 3: Ao sair da partida e voltar ao Menu Principal, StopAllGameplaySounds para o SFX e a plateia
  manager.StopAllGameplaySounds();
  assert.equal(manager.getScreenState(), 'menu');
  assert.equal(manager.getShoeSqueakSource(), null);
  assert.ok(stoppedCount >= 1, 'shoeSqueakSource.stop() must be called when returning to Menu');
  assert.ok(calls.some((c) => c.method === 'setCrowdForSlot' && c.args[0] === false));
  assert.equal(manager.PlayRandomShoeSqueak({ intensity: 1.0 }), false);
});

test('CustomSoundtrackManager persists uploaded URLs to Cloud Database and dynamically loads MenuMusic, CrowdAmbient, and ShoeSqueaks on startup in production', async () => {
  const { bridge, calls } = createMockBridge();
  let appliedCrowdBuffer: AudioBuffer | null = null;
  let appliedCrowdVolume = 0.65;
  let appliedShoeVolume = 0.85;

  const fakeDecodedBuffer = { duration: 1.8 } as unknown as AudioBuffer;
  const fakeCtx = {
    currentTime: 0,
    destination: {},
    decodeAudioData: async () => fakeDecodedBuffer,
    createBufferSource: () => ({
      buffer: null as AudioBuffer | null,
      loop: false,
      playbackRate: { setValueAtTime: () => {} },
      connect: () => ({ connect: () => {} }),
      start: () => {},
      stop: () => {},
      disconnect: () => {},
    }),
    createGain: () => ({
      gain: {
        value: 1,
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        cancelScheduledValues: () => {},
      },
      connect: () => ({}),
      disconnect: () => {},
    }),
  } as unknown as AudioContext;

  bridge.ensureMusicBus = () => ({ ctx: fakeCtx, inputNode: {} as AudioNode });
  bridge.getSfxPlaybackContext = () => ({ ctx: fakeCtx, sfxGain: 0.9 });
  bridge.setCustomCrowdBuffer = (buf) => {
    appliedCrowdBuffer = buf;
  };
  bridge.setCrowdVolume = (vol) => {
    appliedCrowdVolume = vol;
  };
  bridge.setShoeSqueakVolume = (vol) => {
    appliedShoeVolume = vol;
  };

  // Simula o Banco de Dados em Nuvem (Firestore + Cloud Storage) compartilhado entre Preview e Produção
  const cloudFilesByUrl = new Map<string, ArrayBuffer>();
  const cloudTracks: Array<{
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    createdAtMs: number;
    url: string;
    storageUrl: string;
    category: import('./customSoundtrackManager.ts').AudioCloudCategory;
  }> = [];
  let cloudConfig: RemoteAudioConfigPayload = {
    configId: 'global',
    menuMusicUrl: '',
    crowdAmbientUrl: '',
    shoeSqueakUrls: [],
    crowdTrackId: '',
    assignments: {
      MenuTheme: null,
      Stage1_BGM: null,
      Stage2_BGM: null,
      Stage3_BGM: null,
      Stage4_BGM: null,
      Stage5_BGM: null,
      Stage6_BGM: null,
      Stage7_BGM: null,
    },
    sfxAssignments: {
      ShoeSqueaks: [],
      ImpactSpike: [],
      ImpactReceive: [],
      FloorSlam: [],
      Whistle: [],
      Jump: [],
    },
    fadeOutSec: 0.65,
    fadeInSec: 0.65,
    crowdVolume: 0.78,
    shoeSqueakVolume: 0.92,
  };

  const mockRemoteSync: RemoteAudioSyncAdapter = {
    fetchConfig: async () => ({
      config: { ...cloudConfig },
      tracks: [...cloudTracks],
    }),
    uploadTrack: async (req) => {
      const url = `https://storage.googleapis.com/vivid-guide-xw2pc/custom_audio/${req.id}.mp3`;
      const binary = Buffer.from(req.dataBase64, 'base64');
      const ab = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
      cloudFilesByUrl.set(url, ab);

      const track = {
        id: req.id,
        name: req.name,
        mimeType: req.mimeType,
        sizeBytes: binary.byteLength,
        createdAtMs: Date.now(),
        url,
        storageUrl: url,
        category: req.category,
      };
      cloudTracks.push(track);

      if (req.assignSlot === 'MenuTheme' || req.category === 'MenuMusic') {
        cloudConfig.assignments.MenuTheme = req.id;
        cloudConfig.menuMusicUrl = url;
      } else if (req.assignSlot === 'CrowdAmbience' || req.category === 'CrowdAmbient') {
        cloudConfig.crowdTrackId = req.id;
        cloudConfig.crowdAmbientUrl = url;
      } else if (req.assignSlot === 'ShoeSqueaks' || req.category === 'ShoeSqueaks') {
        cloudConfig.sfxAssignments.ShoeSqueaks.push(req.id);
        cloudConfig.shoeSqueakUrls.push(url);
      }
      return { track, config: { ...cloudConfig } };
    },
    saveConfig: async (patch) => {
      cloudConfig = { ...cloudConfig, ...patch };
      return cloudConfig;
    },
    deleteTrack: async () => cloudConfig,
    fetchAudioBufferByUrl: async (url: string) => cloudFilesByUrl.get(url) ?? null,
  };

  // 1. Cliente A (Ambiente de Teste) faz upload de MenuMusic, CrowdAmbient e 2 amostras de ShoeSqueaks
  const uploaderManager = new CustomSoundtrackManager(bridge, undefined, Math.random, mockRemoteSync);
  uploaderManager.setCrowdVolume(0.78);
  uploaderManager.setShoeSqueakVolume(0.92);
  const sampleBuf = new Uint8Array([10, 20, 30, 40, 50]).buffer;

  const menuTrack = await uploaderManager.uploadTrackFromBuffer('menu_legend.mp3', 'audio/mpeg', sampleBuf, {
    category: 'MenuMusic',
    assignSlot: 'MenuTheme',
  });
  uploaderManager.assignTrackToSlot('MenuTheme', menuTrack.id);

  const crowdTrack = await uploaderManager.uploadTrackFromBuffer('torcida_arena.ogg', 'audio/ogg', sampleBuf, {
    category: 'CrowdAmbient',
    assignSlot: 'CrowdAmbience',
  });
  uploaderManager.assignCrowdTrack(crowdTrack.id);

  await uploaderManager.uploadShoeSqueakFromBuffers([
    { name: 'squeak_left.wav', mimeType: 'audio/wav', buffer: sampleBuf },
    { name: 'squeak_right.wav', mimeType: 'audio/wav', buffer: sampleBuf },
  ]);

  assert.ok(cloudConfig.menuMusicUrl.startsWith('https://storage.googleapis.com/'));
  assert.ok(cloudConfig.crowdAmbientUrl.startsWith('https://storage.googleapis.com/'));
  assert.equal(cloudConfig.shoeSqueakUrls.length, 2);

  // 2. Cliente B (Ambiente de Produção / Google Cloud Run Live Link sem dados locais no navegador)
  const prodManager = new CustomSoundtrackManager(bridge, undefined, Math.random, mockRemoteSync);
  assert.equal(prodManager.getState().tracks.length, 0, 'Fresh production client starts with empty local cache');

  // Inicializa o CustomAudioManager buscando as URLs salvas no banco de dados via LoadAudioSettingsFromDB()
  const loadedOk = await prodManager.LoadAudioSettingsFromDB();
  await new Promise((r) => setTimeout(r, 15));

  assert.equal(loadedOk, true);
  const prodState = prodManager.getState();
  assert.equal(prodState.tracks.length, 4, 'All 4 custom tracks must be loaded from Cloud Database');
  assert.equal(prodManager.hasTrackForSlot('MenuTheme'), true, 'MenuTheme must be bound from Cloud Database');
  assert.equal(prodState.crowdTrackId, crowdTrack.id, 'CrowdAmbience track ID must be restored from Cloud Database');
  assert.equal(prodManager.ShoeSqueakSounds.length, 2, 'ShoeSqueakSounds array must be populated from Cloud URLs');
  assert.equal(prodManager.menuMusic, fakeDecodedBuffer, 'menuMusic AudioClip must be replaced dynamically from DB stream');
  assert.equal(prodManager.crowdMusic, fakeDecodedBuffer, 'crowdMusic AudioClip must be replaced dynamically from DB stream');
  assert.equal(prodManager.shoeSqueaks.length, 2, 'shoeSqueaks AudioClip array must be populated from DB stream');
  assert.equal(appliedCrowdBuffer, fakeDecodedBuffer, 'Custom CrowdAmbient buffer must be decoded and applied');
  assert.equal(appliedCrowdVolume, 0.78);
  assert.equal(appliedShoeVolume, 0.92);
  assert.equal(prodManager.getStatus().activeSlot, 'MenuTheme');
  assert.equal(prodManager.getStatus().activeMode, 'custom');
  assert.ok(calls.some((c) => c.method === 'setCustomExclusiveMode' && c.args[0] === true));

  // 3. Fallback de Segurança: se a requisição falhar (ex: sem internet ou erro de rede), captura silenciosamente no try/catch e mantém os áudios originais da build
  const offlineSync: RemoteAudioSyncAdapter = {
    fetchConfig: async () => {
      throw new Error('Network offline');
    },
    uploadTrack: async () => null,
    saveConfig: async () => null,
    deleteTrack: async () => null,
    fetchAudioBufferByUrl: async () => null,
  };
  const { bridge: offlineBridge, calls: offlineCalls } = createMockBridge();
  const offlineManager = new CustomSoundtrackManager(offlineBridge, undefined, Math.random, offlineSync);
  const fallbackResult = await offlineManager.LoadAudioSettingsFromDB();
  assert.equal(fallbackResult, false, 'Offline LoadAudioSettingsFromDB must catch error silently and return false');
  assert.equal(offlineManager.menuMusic, null);
  assert.ok(
    offlineCalls.some((c) => c.method === 'setCustomExclusiveMode' && c.args[0] === false),
    'Offline fallback must keep built-in default/procedural audio active',
  );
});

test('Invisible Admin Auth Method 1 (?adminKey) & Method 2 (7 taps in < 3s + secret password)', async () => {
  const {
    DEFAULT_ADMIN_URL_KEY,
    DEFAULT_ADMIN_7TAP_PASSWORD,
    extractAdminKeyFromUrlSearch,
  } = await import('./customSoundtrackManager.ts');
  const { bridge } = createMockBridge();
  const manager = new CustomSoundtrackManager(bridge);

  // Inicia sempre como false para usuários comuns
  assert.equal(manager.isAdminUser(), false);

  // Método 1: Extração e validação via parâmetro de URL (?adminKey=CHAVE_SECRETA)
  assert.equal(extractAdminKeyFromUrlSearch('?foo=1&adminKey=spike-admin-2025'), DEFAULT_ADMIN_URL_KEY);
  assert.equal(extractAdminKeyFromUrlSearch('?foo=1'), null);

  // Chave incorreta na URL não desbloqueia o modo Admin
  const wrongUrlOk = await manager.checkUrlAdminKey('?adminKey=chave-errada-123');
  assert.equal(wrongUrlOk, false);
  assert.equal(manager.isAdminUser(), false);

  // Chave correta na URL desbloqueia silenciosamente isAdmin = true
  const validUrlOk = await manager.checkUrlAdminKey(`?adminKey=${DEFAULT_ADMIN_URL_KEY}`);
  assert.equal(validUrlOk, true);
  assert.equal(manager.isAdminUser(), true);

  // Faz logout para testar o Método 2
  manager.logoutAdmin();
  assert.equal(manager.isAdminUser(), false);

  // Método 2: 7 toques em menos de 3 segundos (3000ms) no Texto da Versão do Jogo
  const baseTime = 10_000;
  for (let tap = 1; tap <= 6; tap++) {
    assert.equal(manager.registerSecretVersionTap(baseTime + tap * 250), false);
  }
  // 7º toque dentro de 3 segundos (1750ms após o 1º) abre o painel minimalista
  assert.equal(manager.registerSecretVersionTap(baseTime + 7 * 250), true);

  // Se os toques demorarem mais de 3 segundos (> 3000ms), o contador expira e não abre
  for (let tap = 1; tap <= 6; tap++) {
    assert.equal(manager.registerSecretVersionTap(baseTime + 20_000 + tap * 600), false);
  }
  assert.equal(manager.registerSecretVersionTap(baseTime + 20_000 + 3800), false);

  // Senha incorreta no painel minimalista retorna ok: false e mantém isAdmin = false
  const badAuth = await manager.authenticateAdminWithPassword('tentativa-errada');
  assert.equal(badAuth.ok, false);
  assert.equal(manager.isAdminUser(), false);

  // Senha correta do fallback de 7 toques ativa isAdmin = true
  const goodAuth = await manager.authenticateAdminWithPassword(DEFAULT_ADMIN_7TAP_PASSWORD);
  assert.equal(goodAuth.ok, true);
  assert.equal(manager.isAdminUser(), true);
});

test('CrowdSource Isolation, Real-Time Volume (Admin * User) & stopCrowd() reset', async () => {
  const { soundEngine } = await import('./soundEngine.ts');
  const { bridge } = createMockBridge();
  const manager = new CustomSoundtrackManager(bridge);
  const sampleBuf = new Uint8Array([1, 2, 3, 4]).buffer;

  // Faz upload do arquivo da plateia do ginásio
  const crowdTrack = await manager.uploadTrackFromBuffer(
    'SOM DE GINAGIO PLATEIA JOGO VOLEY.mp3',
    'audio/mpeg',
    sampleBuf,
    { category: 'CrowdAmbient', assignSlot: 'CrowdAmbience' },
  );
  manager.assignCrowdTrack(crowdTrack.id);

  // Verifica resolução da URL do arquivo da plateia
  assert.equal(manager.crowdSource.src, `/api/audio/stream/${crowdTrack.id}`);

  // Configura volume do Admin (0.5) e volume do Usuário (0.4) -> volumeFinal = 0.20 (sem piso fixo de 0.5)
  soundEngine.setMuted(false);
  soundEngine.setVolumes(0.8, 0.4);
  manager.setCrowdVolume(0.5);

  // Inicia a partida: para BGM e dispara crowdSource
  manager.StartMatchCrowdAmbience();
  assert.equal(manager.crowdSource.isPlaying, true);
  assert.equal(manager.crowdSource.loop, true);
  assert.equal(manager.crowdSource.muted, false);
  assert.ok(Math.abs(manager.crowdSource.volume - 0.2) < 1e-6, `Expected 0.2, got ${manager.crowdSource.volume}`);

  // Atualização em tempo real: usuário altera slider de SFX durante a partida para 0.25 -> 0.5 * 0.25 = 0.125
  soundEngine.setVolumes(0.8, 0.25);
  manager.syncCrowdSourceVolume();
  assert.ok(Math.abs(manager.crowdSource.volume - 0.125) < 1e-6, `Expected 0.125, got ${manager.crowdSource.volume}`);

  // Atualização em tempo real: Admin altera slider da plateia para 0.8 -> 0.8 * 0.25 = 0.20
  manager.setCrowdVolume(0.8);
  assert.ok(Math.abs(manager.crowdSource.volume - 0.2) < 1e-6, `Expected 0.2, got ${manager.crowdSource.volume}`);

  // Botão de Mudo do Usuário zera imediatamente o volume efetivo e marca muted = true
  soundEngine.setMuted(true);
  manager.syncCrowdSourceVolume();
  assert.equal(manager.crowdSource.volume, 0);
  assert.equal(manager.crowdSource.muted, true);

  // Desmuta para continuar testando isolamento
  soundEngine.setMuted(false);
  soundEngine.setVolumes(0.7, 0.8);
  manager.syncCrowdSourceVolume();
  assert.equal(manager.crowdSource.muted, false);
  assert.ok(Math.abs(manager.crowdSource.volume - 0.64) < 1e-6);

  // Isolamento: chamar bgmSource.Stop() durante a partida NÃO pode parar nem mutar o crowdSource
  manager.bgmSource.Stop();
  assert.equal(manager.crowdSource.isPlaying, true, 'bgmSource.Stop() must not stop crowdSource');
  assert.equal(manager.crowdSource.muted, false);

  // Simula avanço do tempo de reprodução e testa stopCrowd() explícito (pause + currentTime = 0)
  manager.crowdSource.currentTime = 14.5;
  assert.equal(manager.crowdSource.currentTime, 14.5);

  manager.stopCrowd();
  assert.equal(manager.crowdSource.isPlaying, false, 'stopCrowd() must pause crowdSource');
  assert.equal(manager.crowdSource.currentTime, 0, 'stopCrowd() must reset crowdSource.currentTime to 0');

  // Reinicia e verifica se StopAllGameplaySounds() também invoca stopCrowd()
  manager.StartMatchCrowdAmbience();
  manager.crowdSource.currentTime = 8.2;
  assert.equal(manager.crowdSource.isPlaying, true);
  manager.StopAllGameplaySounds();
  assert.equal(manager.crowdSource.isPlaying, false, 'StopAllGameplaySounds() must stop crowdSource on Lobby return');
  assert.equal(manager.crowdSource.currentTime, 0);

  // Trava Singleton: chamar StartMatchCrowdAmbience() enquanto já existe um crowdSource ativo zera a instância anterior antes do novo play()
  manager.StartMatchCrowdAmbience();
  manager.crowdSource.currentTime = 21.0;
  assert.equal(manager.crowdSource.currentTime, 21.0);
  manager.StartMatchCrowdAmbience();
  assert.equal(manager.crowdSource.isPlaying, true);
  assert.equal(manager.crowdSource.currentTime, 0, 'Singleton play() must reset previous crowdSource instance');

  // Trava Automática em SwitchBGM('lobbyBGM') e playLobbyBGM(): corta a plateia obrigatoriamente na primeira linha
  manager.crowdSource.currentTime = 11.4;
  manager.setScreenState('menu');
  await manager.playLobbyBGM();
  assert.equal(manager.crowdSource.isPlaying, false, 'playLobbyBGM() / SwitchBGM(lobbyBGM) must call stopCrowd() on first line');
  assert.equal(manager.crowdSource.currentTime, 0);
});



