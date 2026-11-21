import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GameBootFlowManager,
  type BootFlowAudioBridge,
  type PlayerPrefsAdapter,
} from './gameBootFlowManager.ts';

function createMemoryPrefs(initial: Record<string, string | number> = {}): PlayerPrefsAdapter {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(initial)) {
    map.set(k, String(v));
  }
  return {
    GetInt: (key, defaultValue) => {
      const raw = map.get(key);
      if (raw === undefined) return defaultValue;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) ? n : defaultValue;
    },
    SetInt: (key, value) => {
      map.set(key, String(Math.floor(value)));
    },
    GetString: (key, defaultValue = '') => map.get(key) ?? defaultValue,
    SetString: (key, value) => {
      map.set(key, value);
    },
  };
}

test('GameBootFlowManager: Fase 1 (Splash) carrega áudio do banco e avança para Fase 2 (Title) tocando titleBGM', async () => {
  const switchedBgms: string[] = [];
  let loadedFromDb = false;

  const audioBridge: BootFlowAudioBridge = {
    LoadAudioSettingsFromDB: async () => {
      loadedFromDb = true;
      return true;
    },
    SwitchBGM: async (target) => {
      switchedBgms.push(target);
      return true;
    },
  };

  const prefs = createMemoryPrefs({ IsFirstTime: 1 });
  const manager = new GameBootFlowManager({ prefs, audio: audioBridge });

  assert.equal(manager.getState().activePanel, 'Panel_Splash');

  const afterBoot = await manager.startBootSequence({ splashHoldMs: 5, fadeDurationMs: 5 });
  assert.equal(loadedFromDb, true);
  assert.equal(afterBoot.activePanel, 'Panel_Title');
  assert.equal(afterBoot.activeBgm, 'titleBGM');
  assert.deepEqual(switchedBgms, ['titleBGM']);
});

test('GameBootFlowManager: Novo Jogador (IsFirstTime == 1) passa por Panel_Terms -> Panel_Login (Google Exclusivo) -> SetInt(IsFirstTime, 0) + SwitchBGM(lobbyBGM) -> Panel_Lobby', async () => {
  const switchedBgms: string[] = [];
  const audioBridge: BootFlowAudioBridge = {
    LoadAudioSettingsFromDB: async () => true,
    SwitchBGM: async (target) => {
      switchedBgms.push(target);
      return true;
    },
  };

  const prefs = createMemoryPrefs({ IsFirstTime: 1 });
  const manager = new GameBootFlowManager({
    prefs,
    audio: audioBridge,
    googleLoginProvider: async () => ({
      uid: 'google_uid_test_1',
      displayName: 'Jogador Novo Google',
      email: 'novo.jogador@gmail.com',
    }),
  });

  await manager.startBootSequence({ splashHoldMs: 0, fadeDurationMs: 0 });
  assert.equal(manager.getState().activePanel, 'Panel_Title');

  // Toque na Title Screen -> IsFirstTime == 1 abre Panel_Terms
  const afterTouch = await manager.handleTitleScreenTouch({ fadeOutMs: 0 });
  assert.equal(afterTouch.activePanel, 'Panel_Terms');

  // Aceitar Termos -> abre Panel_Login
  const afterTerms = manager.acceptTermsOfService();
  assert.equal(afterTerms.activePanel, 'Panel_Login');
  assert.equal(afterTerms.termsAccepted, true);

  // Concluir Login Google -> salva IsFirstTime = 0, faz SwitchBGM('lobbyBGM') e abre Panel_Lobby
  const afterLogin = await manager.loginWithGooglePlayGames();
  assert.equal(afterLogin.activePanel, 'Panel_Lobby');
  assert.equal(afterLogin.isFirstTime, 0);
  assert.equal(prefs.GetInt('IsFirstTime', 1), 0);
  assert.equal(afterLogin.authenticatedUser?.email, 'novo.jogador@gmail.com');
  assert.equal(afterLogin.activeBgm, 'lobbyBGM');
  assert.deepEqual(switchedBgms, ['titleBGM', 'lobbyBGM']);
});

test('GameBootFlowManager: Jogador Recorrente (IsFirstTime == 0) faz Silent Login, chama SwitchBGM(lobbyBGM) e vai direto para Panel_Lobby', async () => {
  const switchedBgms: string[] = [];
  const audioBridge: BootFlowAudioBridge = {
    LoadAudioSettingsFromDB: async () => true,
    SwitchBGM: async (target) => {
      switchedBgms.push(target);
      return true;
    },
  };

  const prefs = createMemoryPrefs({
    IsFirstTime: 0,
    GoogleUserUid: 'google_recurring_99',
    GoogleUserDisplayName: 'Veterano Play Games',
    GoogleUserEmail: 'veterano@gmail.com',
  });

  const manager = new GameBootFlowManager({ prefs, audio: audioBridge });
  await manager.startBootSequence({ splashHoldMs: 0, fadeDurationMs: 0 });

  const afterTouch = await manager.handleTitleScreenTouch({ fadeOutMs: 0 });
  assert.equal(afterTouch.activePanel, 'Panel_Lobby');
  assert.equal(afterTouch.activeBgm, 'lobbyBGM');
  assert.equal(afterTouch.authenticatedUser?.uid, 'google_recurring_99');
  assert.deepEqual(switchedBgms, ['titleBGM', 'lobbyBGM']);
});

test('GameBootFlowManager: Exibe Pop-up de Avaliação (1 a 5 estrelas) após a 3ª partida jogada', async () => {
  const prefs = createMemoryPrefs({ IsFirstTime: 0 });
  const manager = new GameBootFlowManager({
    prefs,
    audio: {
      LoadAudioSettingsFromDB: async () => true,
      SwitchBGM: async () => true,
    },
  });

  const m1 = manager.recordMatchCompleted();
  assert.equal(m1.matchesPlayed, 1);
  assert.equal(m1.shouldShowRatingPopup, false);

  const m2 = manager.recordMatchCompleted();
  assert.equal(m2.matchesPlayed, 2);
  assert.equal(m2.shouldShowRatingPopup, false);

  const m3 = manager.recordMatchCompleted();
  assert.equal(m3.matchesPlayed, 3);
  assert.equal(m3.shouldShowRatingPopup, true);
  assert.equal(manager.getState().isRatingPopupOpen, true);

  const afterRating = await manager.submitGameRating(5, 'Jogo excelente!');
  assert.equal(afterRating.userRatingStars, 5);
  assert.equal(afterRating.isRatingPopupOpen, false);

  // Na 4ª partida não deve abrir novamente pois já avaliou
  const m4 = manager.recordMatchCompleted();
  assert.equal(m4.matchesPlayed, 4);
  assert.equal(m4.shouldShowRatingPopup, false);
});

test('GameBootFlowManager: Awake trava Paisagem (Landscape) + Fullscreen, Splash é 100% silenciosa com Mathf.PingPong e carrega titleAnimationUrl na Title Screen', async () => {
  const { mathfPingPong } = await import('./gameBootFlowManager.ts');
  assert.equal(mathfPingPong(0, 1), 0);
  assert.equal(mathfPingPong(0.5, 1), 0.5);
  assert.equal(mathfPingPong(1, 1), 1);
  assert.equal(mathfPingPong(1.5, 1), 0.5);

  let stopBgmCalledDuringSplash = false;
  const switchedBgms: string[] = [];

  const audioBridge: BootFlowAudioBridge = {
    LoadAudioSettingsFromDB: async () => {
      // Verifica que durante a Splash nenhuma BGM foi iniciada ainda
      assert.equal(switchedBgms.length, 0);
      return true;
    },
    SwitchBGM: async (target) => {
      switchedBgms.push(target);
      return true;
    },
    StopBGM: () => {
      stopBgmCalledDuringSplash = true;
    },
    getTitleAnimationUrl: () => 'https://storage.googleapis.com/spake-legend/title_loop.mp4',
  };

  const prefs = createMemoryPrefs({ IsFirstTime: 1 });
  const manager = new GameBootFlowManager({ prefs, audio: audioBridge });

  const afterBoot = await manager.startBootSequence({ splashHoldMs: 5, fadeDurationMs: 5 });
  assert.equal(stopBgmCalledDuringSplash, true, 'Splash Screen must keep game BGM silent');
  assert.equal(afterBoot.orientationLockedLandscape, true);
  assert.equal(afterBoot.fullscreenEnabled, true);
  assert.equal(afterBoot.activePanel, 'Panel_Title');
  assert.equal(afterBoot.activeBgm, 'titleBGM');
  assert.equal(
    afterBoot.titleAnimationUrl,
    'https://storage.googleapis.com/spake-legend/title_loop.mp4',
  );
  assert.deepEqual(switchedBgms, ['titleBGM']);
});

test('GameBootFlowManager: Splash Screen reproduz splashAnimationUrl (.mp4) com som exclusivo no VideoPlayer (Direct), faz cache local e encerra o áudio do vídeo no Fade Out antes da titleBGM', async () => {
  const observedStates: Array<{
    panel: string;
    splashUrl: string;
    videoAudioActive: boolean;
    activeBgm: string;
  }> = [];

  const prefs = createMemoryPrefs({ IsFirstTime: 1 });
  const manager = new GameBootFlowManager({
    prefs,
    audio: {
      LoadAudioSettingsFromDB: async () => true,
      SwitchBGM: async () => true,
      StopBGM: () => {},
      getSplashAnimationUrl: () => 'https://storage.googleapis.com/spake-legend/studio_splash_logo.mp4',
      getTitleAnimationUrl: () => 'https://storage.googleapis.com/spake-legend/title_loop.mp4',
    },
  });

  manager.subscribe((st) => {
    observedStates.push({
      panel: st.activePanel,
      splashUrl: st.splashAnimationUrl,
      videoAudioActive: st.splashVideoAudioActive,
      activeBgm: st.activeBgm,
    });
  });

  const bootPromise = manager.startBootSequence({ splashHoldMs: 50, fadeDurationMs: 5 });
  // Simula fim do vídeo curto da logo (.mp4) disparando loopPointReached
  setTimeout(() => {
    manager.notifySplashVideoEnded();
  }, 10);

  const finalState = await bootPromise;

  // Durante a Splash, o som do vídeo esteve ativo exclusivamente no VideoPlayer (Direct) enquanto BGM do jogo estava 'none'
  const activeSplashWithVideoAudio = observedStates.some(
    (s) =>
      s.panel === 'Panel_Splash' &&
      s.splashUrl === 'https://storage.googleapis.com/spake-legend/studio_splash_logo.mp4' &&
      s.videoAudioActive === true &&
      s.activeBgm === 'none',
  );
  assert.equal(activeSplashWithVideoAudio, true);

  // Cache local salvo para abrir instantaneamente nos próximos acessos
  assert.equal(
    prefs.GetString('CachedSplashAnimationUrl', ''),
    'https://storage.googleapis.com/spake-legend/studio_splash_logo.mp4',
  );

  // Ao finalizar o Fade Out e liberar a Tela de Título, o áudio do vídeo da Splash é encerrado e a titleBGM inicia
  assert.equal(finalState.activePanel, 'Panel_Title');
  assert.equal(finalState.splashVideoAudioActive, false);
  assert.equal(finalState.activeBgm, 'titleBGM');
});


