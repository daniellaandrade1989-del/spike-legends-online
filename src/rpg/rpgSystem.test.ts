import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BETA_FEEDBACK_GEM_REWARD,
  CAMPAIGN_CHAPTERS,
  GACHA_COST,
  UPGRADE_BASE_COST,
  advanceTournamentRound,
  attemptUpgradeAthleteStat,
  claimBetaDiamondPack,
  claimBetaFeedbackReward,
  claimBetaMissionReward,
  completeCampaignChapter,
  computeEffectiveStats,
  createInitialRpgSave,
  generateTournamentBracket,
  getAthleteCard,
  openBetaGachaBox,
  pullGachaAthlete,
  purchaseShopItem,
  recordBetaMissionProgress,
  rewardMatchVictoryCoins,
  rewardSpecialPointCoins,
  upgradeAthleteStat,
} from './rpgSystem.ts';
import { PlayerController } from '../physics/playerStateMachine.ts';

test('Gacha pull deducts coins, guarantees Legendary at 8th pity roll, and grants duplicate bonus', () => {
  const save = { ...createInitialRpgSave(), coins: 2000, pityCounter: 7 };
  const pull = pullGachaAthlete(save, 0.1);
  assert.ok(pull !== null);
  assert.equal(pull.pulledCard.rarity, 'Lendário', 'Pity counter 7 -> 8 must guarantee Lendário');
  assert.equal(pull.save.pityCounter, 0);
  assert.equal(pull.save.coins, 2000 - GACHA_COST);

  // Sem moedas retorna null
  const broke = pullGachaAthlete({ ...pull.save, coins: 20 }, 0.5);
  assert.equal(broke, null);
});

test('Stat upgrade consumes 100 base coins, increases effective physics attributes, and blocks with Saldo Insuficiente when low on coins', () => {
  const initial = createInitialRpgSave();
  assert.equal(UPGRADE_BASE_COST, 100, 'First RPG stat upgrade costs 100 coins');
  const card = getAthleteCard('akira_starter');
  const before = computeEffectiveStats(card, initial.ownedCards.akira_starter);

  const upgraded = upgradeAthleteStat(initial, 'akira_starter', 'jump');
  assert.ok(upgraded !== null);
  assert.equal(upgraded.coins, initial.coins - 100);

  const after = computeEffectiveStats(card, upgraded.ownedCards.akira_starter);
  assert.equal(after.jump, before.jump + 6);

  // Tentar evoluir sem moedas suficientes bloqueia a compra e retorna "Saldo Insuficiente"
  const lowCoinsSave = { ...upgraded, coins: 40 };
  const failedAttempt = attemptUpgradeAthleteStat(lowCoinsSave, 'akira_starter', 'attack');
  assert.equal(failedAttempt.ok, false);
  assert.equal(failedAttempt.error, 'Saldo Insuficiente');
  assert.equal(failedAttempt.save.coins, 40);
});

test('PlayerStatsManager linked to PlayerController scales jumpForce (Y), moveSpeed (X), and spikeBallSpeed', () => {
  const ctrl = new PlayerController({ attack: 100, defense: 100, jump: 100, speed: 100 });
  const baseJumpY = ctrl.getBaseJumpVelocity();
  const baseMoveX = ctrl.getMaxHorizontalSpeed(false);
  const baseSpike = ctrl.getSpikeBallSpeed();

  // Evolui Força (+3), Salto (+4) e Velocidade (+3) via PlayerStatsManager
  ctrl.applyRpgUpgrades({ attack: 3, defense: 2, jump: 4, speed: 3 });

  assert.equal(ctrl.statsManager.getLevels().attack, 4);
  assert.equal(ctrl.statsManager.getLevels().jump, 5);
  assert.equal(ctrl.statsManager.getLevels().speed, 4);
  assert.ok(ctrl.getBaseJumpVelocity() > baseJumpY, 'Higher Jump RPG level must increase Y jump velocity');
  assert.ok(ctrl.getMaxHorizontalSpeed(false) > baseMoveX, 'Higher Speed RPG level must increase X horizontal speed');
  assert.ok(ctrl.getSpikeBallSpeed() > baseSpike, 'Higher Attack RPG level must increase spike ball speed');
});

test('Shop System unlocks cosmetic ball colors/outfits in Coins and Diamonds, and rewards match victory coins', () => {
  let save = { ...createInitialRpgSave(), coins: 200, gems: 200 };

  // Compra Bola Labareda Solar (150 moedas)
  const buyBall = purchaseShopItem(save, 'ball_crimson_flare');
  assert.equal(buyBall.ok, true);
  assert.equal(buyBall.save.coins, 50);
  assert.equal(buyBall.save.equippedBallColor, '#FF4D4D');
  save = buyBall.save;

  // Compra Bola Galáxia Cósmica (160 Diamantes)
  const buyGalaxy = purchaseShopItem(save, 'ball_galaxy');
  assert.equal(buyGalaxy.ok, true);
  assert.equal(buyGalaxy.save.gems, 40);
  assert.equal(buyGalaxy.save.equippedBallId, 'ball_galaxy');
  assert.equal(buyGalaxy.save.equippedBallTrailColor, '#D946EF');
  save = buyGalaxy.save;

  // Tenta comprar Traje Fundador Beta (260 Diamantes) com apenas 40 Diamantes -> Diamantes Insuficientes
  const failGemBuy = purchaseShopItem(save, 'outfit_fundador_beta');
  assert.equal(failGemBuy.ok, false);
  assert.equal(failGemBuy.error, 'Diamantes Insuficientes');

  // Vencer partida em Classe Mundial adiciona +240 moedas ao saldo
  const winReward = rewardMatchVictoryCoins(save, 'hard');
  assert.equal(winReward.rewardCoins, 240);
  assert.equal(winReward.save.coins, 290);
});

test('Beta Diamond Recharge ("GRÁTIS NO BETA"), 3-Tier Gacha Boxes, Quick Missions, and +500 Diamonds Feedback work accurately', () => {
  let save = createInitialRpgSave();
  const initialGems = save.gems;

  // 1. Recarga Fictícia GRÁTIS NO BETA (+1200 Diamantes)
  const recharge = claimBetaDiamondPack(save, 'pack_1200');
  assert.equal(recharge.ok, true);
  assert.equal(recharge.save.gems, initialGems + 1200);
  save = recharge.save;

  // 2. Abrir Caixa Lendária (350 Diamantes)
  const boxOpen = openBetaGachaBox(save, 'box_legendary', 0.88);
  assert.equal(boxOpen.ok, true);
  assert.equal(boxOpen.rarity, 'Lendário');
  assert.equal(boxOpen.save.gems, initialGems + 1200 - 350);
  save = boxOpen.save;

  // 3. Pontos especiais (Ace/Block) recompensam moedas e avançam missão "Faça 3 saques/pontos"
  save = rewardSpecialPointCoins(save, 'ace').save;
  save = rewardSpecialPointCoins(save, 'block').save;
  save = rewardSpecialPointCoins(save, 'spike').save;
  assert.equal(save.betaMissions?.mission_points_3?.progress, 3);

  const claimMission = claimBetaMissionReward(save, 'mission_points_3');
  assert.equal(claimMission.ok, true);
  assert.equal(claimMission.rewardCoins, 200);
  assert.equal(claimMission.rewardGems, 80);
  save = claimMission.save;

  // Tentar resgatar de novo deve bloquear
  const duplicateClaim = claimBetaMissionReward(save, 'mission_points_3');
  assert.equal(duplicateClaim.ok, false);

  // 4. Registrar partida jogada e resgatar missão "Jogue 1 partida"
  save = recordBetaMissionProgress(save, { matchesPlayed: 1 });
  const playClaim = claimBetaMissionReward(save, 'mission_play_1');
  assert.equal(playClaim.ok, true);
  save = playClaim.save;

  // 5. Feedback do Beta (+500 Diamantes único)
  const fb1 = claimBetaFeedbackReward(save);
  assert.equal(fb1.ok, true);
  assert.equal(fb1.rewardGems, BETA_FEEDBACK_GEM_REWARD);
  const fb2 = claimBetaFeedbackReward(fb1.save);
  assert.equal(fb2.ok, false);
});

test('Campaign chapter completion unlocks next arena, opponent card, and rewards coins', () => {
  const initial = createInitialRpgSave();
  const cap2 = CAMPAIGN_CHAPTERS[1];
  const updated = completeCampaignChapter(initial, cap2.id);

  assert.equal(updated.completedChapters.includes(cap2.id), true);
  assert.equal(updated.unlockedArenas.includes(cap2.unlockArenaId), true);
  assert.ok(updated.ownedCards[cap2.unlockCardId!]);
  assert.equal(updated.coins, initial.coins + cap2.rewardCoins);
});

test('Procedural Tournament Mata-Mata advances Quartas -> Semi -> Final -> Campeão', () => {
  let t = generateTournamentBracket('Akira', 'akira', 'medium', 'ginasio');
  assert.equal(t.currentRound, 'quartas');
  assert.equal(t.matches.length, 4);

  t = advanceTournamentRound(t, true);
  assert.equal(t.currentRound, 'semi');
  assert.equal(t.matches.filter((m) => m.round === 'semi').length, 2);

  t = advanceTournamentRound(t, true);
  assert.equal(t.currentRound, 'final');
  assert.equal(t.matches.filter((m) => m.round === 'final').length, 1);

  t = advanceTournamentRound(t, true);
  assert.equal(t.currentRound, 'completed');
  assert.equal(t.eliminated, false);
  assert.equal(t.championName, 'Akira');
});
