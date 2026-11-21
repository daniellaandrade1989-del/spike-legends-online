/**
 * Spike Legends Online — Loja do Jogo (Modo Beta — Monetização Fictícia & Sistema RPG):
 * Organizada em 4 abas:
 * 1. Recarga (Diamantes) — Pacotes fictícios (100, 500, 1.200 e 5.000 Diamantes) com preço riscado e "GRÁTIS NO BETA"
 * 2. Caixas / Roleta (Gacha) — 3 níveis de caixa (Comum em Coins, Épica e Lendária em Diamantes) + Recrutamento & Evolução RPG
 * 3. Skins e Uniformes — Neon Cyber, Samurai, Seleção Ouro, Fundador Beta, etc. ("Comprar" -> "Equipar" -> "Equipado")
 * 4. Bolas e Rastros (Trails) — Fogo, Raio Azul, Galáxia, Ouro, Oficial Pro com rastro luminoso na quadra 3D
 */
import React, { useState } from 'react';
import {
  ArrowUpCircle,
  Coins,
  Gem,
  Sparkles,
  Check,
  AlertTriangle,
  ShoppingBag,
  Shirt,
  Flame,
  Gift,
  Star,
} from 'lucide-react';
import type { CharacterStats } from '../config/gameConfig';
import {
  ATHLETE_CATALOG,
  BETA_GACHA_BOXES,
  DIAMOND_RECHARGE_PACKS,
  GACHA_COST,
  MAX_STAT_UPGRADES,
  RARITY_COLORS,
  SHOP_ITEMS,
  computeEffectiveStats,
  getAthleteCard,
  getStatUpgradeCost,
  type BetaGachaBoxResult,
  type BetaGachaBoxTier,
  type DiamondRechargePack,
  type GachaPullResult,
  type PlayerRpgSave,
  type ShopCosmeticItem,
} from '../rpg/rpgSystem';
import { PlayerStatsManager } from '../rpg/playerStatsManager';
import { soundEngine } from '../audio/soundEngine';
import { AnimeAvatar } from './AnimeAvatar';

export type StoreTabId = 'recharge' | 'gacha' | 'outfits' | 'balls';

interface RpgShopPanelProps {
  rpgSave: PlayerRpgSave;
  initialTab?: StoreTabId;
  onPullGacha: () => GachaPullResult | null;
  onSelectCard: (cardId: string) => void;
  onUpgradeStat: (cardId: string, statKey: keyof CharacterStats) => { ok: boolean; error: string | null };
  onPurchaseShopItem?: (itemId: string) => { ok: boolean; error: string | null };
  onClaimDiamondPack?: (packId: string) => { ok: boolean; pack: DiamondRechargePack | null };
  onOpenGachaBox?: (boxId: BetaGachaBoxTier['id']) => BetaGachaBoxResult;
}

const STAT_META: Array<{
  key: keyof CharacterStats;
  label: string;
  axisTag: string;
  desc: string;
  color: string;
}> = [
  {
    key: 'attack',
    label: 'Força (Ataque)',
    axisTag: 'Corte / Spike',
    desc: 'Impacta diretamente a velocidade da bola no corte',
    color: '#F97316',
  },
  {
    key: 'jump',
    label: 'Salto (Impulsão)',
    axisTag: 'Eixo Y',
    desc: 'Multiplica a força e altura máxima do pulo vertical',
    color: '#FACC15',
  },
  {
    key: 'speed',
    label: 'Velocidade',
    axisTag: 'Eixo X / Z',
    desc: 'Multiplica a velocidade de deslocamento na quadra',
    color: '#34D399',
  },
  {
    key: 'defense',
    label: 'Defesa (Reflexo)',
    axisTag: 'Hitbox / Guard',
    desc: 'Expande o raio de recepção e resistência a Guard Break',
    color: '#38BDF8',
  },
];

export const RpgShopPanel: React.FC<RpgShopPanelProps> = ({
  rpgSave,
  initialTab = 'recharge',
  onPullGacha,
  onSelectCard,
  onUpgradeStat,
  onPurchaseShopItem,
  onClaimDiamondPack,
  onOpenGachaBox,
}) => {
  const [activeStoreTab, setActiveStoreTab] = useState<StoreTabId>(initialTab);
  const [lastPull, setLastPull] = useState<GachaPullResult | null>(null);
  const [lastBoxResult, setLastBoxResult] = useState<BetaGachaBoxResult | null>(null);
  const [openingBoxId, setOpeningBoxId] = useState<string | null>(null);
  const [simulatedApprovalBanner, setSimulatedApprovalBanner] = useState<{
    packName: string;
    gemsAdded: number;
  } | null>(null);
  const [shopNotice, setShopNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const activeCard = getAthleteCard(rpgSave.activeCardId);
  const activeOwned = rpgSave.ownedCards[rpgSave.activeCardId];
  const effectiveStats = computeEffectiveStats(activeCard, activeOwned);
  const rarityStyle = RARITY_COLORS[activeCard.rarity];
  const gemsBalance = rpgSave.gems ?? 0;

  const previewStatsMgr = new PlayerStatsManager(activeCard.baseStats, {
    attack: (activeOwned?.upgrades.attack ?? 0) + 1,
    defense: (activeOwned?.upgrades.defense ?? 0) + 1,
    jump: (activeOwned?.upgrades.jump ?? 0) + 1,
    speed: (activeOwned?.upgrades.speed ?? 0) + 1,
  });
  const physicsMults = previewStatsMgr.computePhysicsMultipliers();

  const handleSimulatedRecharge = (pack: DiamondRechargePack) => {
    soundEngine.playPerfectHit();
    soundEngine.playUltimate();
    if (onClaimDiamondPack) {
      const res = onClaimDiamondPack(pack.id);
      if (res.ok) {
        setShopNotice(null);
        setSimulatedApprovalBanner({
          packName: pack.name,
          gemsAdded: pack.gemsAmount,
        });
        setSuccessNotice(`Compra Simulada Aprovada! +${pack.gemsAmount.toLocaleString('pt-BR')} Diamantes creditados!`);
        window.setTimeout(() => {
          setSimulatedApprovalBanner((curr) =>
            curr?.packName === pack.name ? null : curr,
          );
        }, 2800);
      }
    }
  };

  const handleOpenBetaBox = (box: BetaGachaBoxTier) => {
    soundEngine.playButtonClick();
    const balance = box.currency === 'gems' ? gemsBalance : rpgSave.coins;
    if (balance < box.cost) {
      setSuccessNotice(null);
      setShopNotice(
        box.currency === 'gems'
          ? `Diamantes Insuficientes! A ${box.name} custa ${box.cost} Diamantes (Recarregue grátis na aba Recarga!).`
          : `Saldo Insuficiente! A ${box.name} custa ${box.cost} Spike Coins (Saldo: ${rpgSave.coins}).`,
      );
      return;
    }
    if (!onOpenGachaBox) return;

    setOpeningBoxId(box.id);
    setLastBoxResult(null);
    window.setTimeout(() => {
      const res = onOpenGachaBox(box.id);
      setOpeningBoxId(null);
      if (!res.ok) {
        setSuccessNotice(null);
        setShopNotice(res.error || 'Saldo Insuficiente');
        return;
      }
      if (res.rarity === 'Lendário') {
        soundEngine.playUltimate();
      } else {
        soundEngine.playPerfectHit();
      }
      setLastBoxResult(res);
      setShopNotice(null);
      setSuccessNotice(
        `Caixa aberta! Você ganhou [${res.rarity.toUpperCase()}] ${res.rewardName}${
          res.isDuplicate ? ` (+${res.bonusCoins} Coins bônus)` : '!'
        }`,
      );
    }, 420);
  };

  const handleRollGacha = () => {
    soundEngine.playButtonClick();
    if (rpgSave.coins < GACHA_COST) {
      setSuccessNotice(null);
      setShopNotice(`Saldo Insuficiente! Você precisa de ${GACHA_COST} moedas (Saldo atual: ${rpgSave.coins}).`);
      return;
    }
    const res = onPullGacha();
    if (!res) {
      setSuccessNotice(null);
      setShopNotice('Saldo Insuficiente');
      return;
    }
    soundEngine.playUltimate();
    setLastPull(res);
    setShopNotice(null);
    setSuccessNotice(`Atleta ${res.pulledCard.name} recrutado com sucesso!`);
  };

  const handleTryUpgradeStat = (statKey: keyof CharacterStats, label: string, cost: number, maxed: boolean) => {
    if (maxed) return;
    if (rpgSave.coins < cost) {
      soundEngine.playButtonClick();
      setSuccessNotice(null);
      setShopNotice(`Saldo Insuficiente! Custa ${cost} moedas para subir +1 de ${label} (Saldo: ${rpgSave.coins}).`);
      return;
    }
    const result = onUpgradeStat(activeCard.cardId, statKey);
    if (!result.ok) {
      soundEngine.playButtonClick();
      setSuccessNotice(null);
      setShopNotice(result.error || 'Saldo Insuficiente');
      return;
    }
    soundEngine.playPerfectHit();
    setShopNotice(null);
    setSuccessNotice(`${label} evoluído para Nv. ${(activeOwned?.upgrades[statKey] ?? 0) + 2}!`);
  };

  const handleTryBuyItem = (item: ShopCosmeticItem, isUnlocked: boolean) => {
    const currency = item.currency ?? 'coins';
    const currentBal = currency === 'gems' ? gemsBalance : rpgSave.coins;
    if (!isUnlocked && currentBal < item.cost) {
      soundEngine.playButtonClick();
      setSuccessNotice(null);
      setShopNotice(
        currency === 'gems'
          ? `Diamantes Insuficientes! "${item.name}" custa ${item.cost} Diamantes (Recarregue grátis na aba Recarga!).`
          : `Saldo Insuficiente! "${item.name}" custa ${item.cost} Spike Coins (Saldo: ${rpgSave.coins}).`,
      );
      return;
    }
    if (!onPurchaseShopItem) return;
    const res = onPurchaseShopItem(item.id);
    if (!res.ok) {
      soundEngine.playButtonClick();
      setSuccessNotice(null);
      setShopNotice(res.error || 'Saldo Insuficiente');
      return;
    }
    soundEngine.playPerfectHit();
    setShopNotice(null);
    setSuccessNotice(isUnlocked ? `${item.name} equipado na quadra 3D!` : `${item.name} desbloqueado e equipado!`);
  };

  const unlockedItems = rpgSave.unlockedShopItems ?? ['ball_classic', 'outfit_default'];
  const outfitItems = SHOP_ITEMS.filter((i) => i.category === 'outfit');
  const ballItems = SHOP_ITEMS.filter((i) => i.category === 'ball_color');

  const isBallItemEquipped = (item: ShopCosmeticItem): boolean => {
    if (rpgSave.equippedBallId) {
      return rpgSave.equippedBallId === item.id;
    }
    return (rpgSave.equippedBallColor ?? '#FACC15') === item.previewHex;
  };

  return (
    <div data-testid="rpg-shop-panel" className="flex flex-col gap-5">
      {/* Cabeçalho da Loja com Saldo Duplo (Spike Coins & Volley Gems / Diamantes) e 4 Abas */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-[10px] font-black uppercase tracking-wider mb-1">
              <Sparkles className="w-3 h-3" /> Modo Beta • Monetização Fictícia (Sem Cobrança Real)
            </div>
            <h2 className="font-display font-black text-2xl text-white uppercase tracking-tight flex items-center gap-2">
              <ShoppingBag className="w-6 h-6 text-[#F97316]" />
              Loja Oficial Spake Legend
            </h2>
          </div>

          {/* Saldos Persistentes na Loja */}
          <div className="flex items-center gap-2.5">
            <div className="px-3.5 py-2 rounded-xl bg-[#1E293B] border border-amber-400/40 flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" />
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none">
                  Spike Coins
                </div>
                <div data-testid="rpg-coins-balance" className="font-mono-num font-black text-sm text-amber-300">
                  {rpgSave.coins.toLocaleString('pt-BR')}
                </div>
              </div>
            </div>

            <div className="px-3.5 py-2 rounded-xl bg-[#1E293B] border border-cyan-400/50 flex items-center gap-2">
              <Gem className="w-4 h-4 text-cyan-400" />
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-none">
                  Diamantes
                </div>
                <div data-testid="rpg-gems-balance" className="font-mono-num font-black text-sm text-cyan-300">
                  {gemsBalance.toLocaleString('pt-BR')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navegação das 4 Abas da Loja */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            data-testid="store-tab-recharge"
            onClick={() => {
              soundEngine.playButtonClick();
              setActiveStoreTab('recharge');
            }}
            className={`py-2.5 px-3 rounded-xl font-display font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all ${
              activeStoreTab === 'recharge'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 border border-cyan-300'
                : 'bg-[#1E293B] hover:bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            <Gem className="w-4 h-4" />
            1. Recarga (Grátis Beta)
          </button>

          <button
            type="button"
            data-testid="store-tab-gacha"
            onClick={() => {
              soundEngine.playButtonClick();
              setActiveStoreTab('gacha');
            }}
            className={`py-2.5 px-3 rounded-xl font-display font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all ${
              activeStoreTab === 'gacha'
                ? 'bg-gradient-to-r from-purple-600 to-amber-500 text-white shadow-lg shadow-purple-500/20 border border-amber-300'
                : 'bg-[#1E293B] hover:bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            <Gift className="w-4 h-4" />
            2. Caixas / Gacha & RPG
          </button>

          <button
            type="button"
            data-testid="store-tab-outfits"
            onClick={() => {
              soundEngine.playButtonClick();
              setActiveStoreTab('outfits');
            }}
            className={`py-2.5 px-3 rounded-xl font-display font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all ${
              activeStoreTab === 'outfits'
                ? 'bg-[#F97316] text-slate-950 shadow-lg shadow-orange-500/20 border border-orange-300'
                : 'bg-[#1E293B] hover:bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            <Shirt className="w-4 h-4" />
            3. Skins e Uniformes
          </button>

          <button
            type="button"
            data-testid="store-tab-balls"
            onClick={() => {
              soundEngine.playButtonClick();
              setActiveStoreTab('balls');
            }}
            className={`py-2.5 px-3 rounded-xl font-display font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all ${
              activeStoreTab === 'balls'
                ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20 border border-amber-200'
                : 'bg-[#1E293B] hover:bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            <Flame className="w-4 h-4" />
            4. Bolas e Rastros
          </button>
        </div>
      </div>

      {/* Animação Chamativa de Compra Simulada Aprovada! */}
      {simulatedApprovalBanner && (
        <div
          data-testid="simulated-purchase-approved-banner"
          className="animate-spike-pop bg-gradient-to-r from-emerald-900/95 via-teal-900/95 to-cyan-900/95 border-2 border-emerald-400 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-400/20 border border-emerald-300 flex items-center justify-center text-emerald-300 shrink-0">
              <Check className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-widest text-emerald-300">
                COMPRA SIMULADA APROVADA! • MODO BETA TESTE
              </div>
              <div className="font-display font-black text-lg text-white">
                {simulatedApprovalBanner.packName} (+{simulatedApprovalBanner.gemsAdded.toLocaleString('pt-BR')} Diamantes)
              </div>
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-emerald-400 text-slate-950 font-display font-black text-xs uppercase">
            R$ 0,00 • GRÁTIS NO BETA
          </div>
        </div>
      )}

      {/* Aviso Global de Saldo Insuficiente ou Confirmação */}
      {shopNotice && (
        <div
          data-testid="shop-insufficient-funds"
          className="flex items-center gap-2.5 text-sm font-bold text-rose-200 bg-rose-950/85 border-2 border-rose-500 rounded-xl px-4 py-3"
        >
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{shopNotice}</span>
        </div>
      )}

      {successNotice && !shopNotice && (
        <div
          data-testid="shop-success-notice"
          className="flex items-center gap-2 text-xs font-bold text-emerald-200 bg-emerald-950/75 border border-emerald-500/60 rounded-xl px-4 py-2.5"
        >
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* ========================================================================
          ABA 1: RECARGA DE DIAMANTES (GRÁTIS NO BETA)
      ======================================================================== */}
      {activeStoreTab === 'recharge' && (
        <section
          data-testid="store-section-recharge"
          className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 flex flex-col gap-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-black text-xl text-white flex items-center gap-2">
                <Gem className="w-5 h-5 text-cyan-400" />
                Recarga de Volley Gems (Diamantes)
              </h3>
              <p className="text-xs text-slate-400">
                Durante o Beta Teste, todos os pacotes de Diamantes são 100% gratuitos para você testar caixas lendárias, skins e rastros!
              </p>
            </div>
            <span className="px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-display font-black text-xs uppercase">
              Gateway Fictício Ativo
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {DIAMOND_RECHARGE_PACKS.map((pack) => (
              <div
                key={pack.id}
                data-testid={`diamond-pack-${pack.id}`}
                className={`relative rounded-2xl p-5 border-2 flex flex-col justify-between gap-4 transition-transform hover:-translate-y-0.5 ${
                  pack.popular
                    ? 'bg-gradient-to-b from-cyan-950/80 to-[#1E293B] border-cyan-400'
                    : 'bg-[#1E293B] border-slate-700 hover:border-cyan-400/60'
                }`}
              >
                {/* Etiqueta Chamativa GRÁTIS NO BETA */}
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-md bg-emerald-400 text-slate-950 font-display font-black text-[10px] uppercase tracking-wider shadow">
                    {pack.badgeText}
                  </span>
                  {pack.popular && (
                    <span className="px-2 py-0.5 rounded bg-amber-400/20 border border-amber-400 text-amber-300 font-bold text-[10px] uppercase">
                      MAIS POPULAR
                    </span>
                  )}
                </div>

                <div className="flex flex-col items-center text-center py-2">
                  <div className="w-16 h-16 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center mb-3 shadow-inner">
                    <Gem className="w-9 h-9 text-cyan-300" />
                  </div>
                  <div className="font-mono-num font-black text-3xl text-white">
                    +{pack.gemsAmount.toLocaleString('pt-BR')}
                  </div>
                  <div className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                    Volley Gems / Diamantes
                  </div>
                  <div className="text-sm font-display font-bold text-slate-200 mt-1">{pack.name}</div>
                  <div className="text-[11px] text-slate-400">{pack.bonusLabel}</div>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-slate-700/80">
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <span className="text-slate-400 line-through font-mono-num">
                      {pack.fictionalOriginalPrice}
                    </span>
                    <span className="text-emerald-300 font-black uppercase">R$ 0,00</span>
                  </div>

                  <button
                    type="button"
                    data-testid={`btn-claim-${pack.id}`}
                    onClick={() => handleSimulatedRecharge(pack)}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 font-display font-black text-xs uppercase tracking-wider cursor-pointer transition-all shadow-md"
                  >
                    RESGATAR GRÁTIS NO BETA
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ========================================================================
          ABA 2: CAIXAS / ROLETA (GACHA) & EVOLUÇÃO RPG
      ======================================================================== */}
      {activeStoreTab === 'gacha' && (
        <div data-testid="store-section-gacha" className="flex flex-col gap-6">
          {/* 3 Níveis de Caixa Gacha */}
          <section className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display font-black text-xl text-white flex items-center gap-2">
                  <Gift className="w-5 h-5 text-amber-400" />
                  Caixas Misteriosas & Roleta Gacha (3 Níveis)
                </h3>
                <p className="text-xs text-slate-400">
                  Abra caixas para sortear Skins raras, Bolas com rastro luminoso e Cartas de Atletas Lendários!
                </p>
              </div>
              <span className="text-xs font-mono-num text-amber-300 bg-[#1E293B] px-3 py-1 rounded-lg border border-amber-400/30">
                Pity Lendário Garantido: {rpgSave.pityCounter}/8
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {BETA_GACHA_BOXES.map((box) => {
                const isOpening = openingBoxId === box.id;
                return (
                  <div
                    key={box.id}
                    data-testid={`gacha-box-${box.id}`}
                    className="rounded-2xl p-5 bg-[#1E293B] border-2 flex flex-col justify-between gap-4"
                    style={{ borderColor: box.accentHex }}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider text-slate-950"
                          style={{ backgroundColor: box.accentHex }}
                        >
                          Mínimo: {box.guaranteedMinRarity}
                        </span>
                        <span className="text-[11px] font-bold text-slate-300">
                          {box.currency === 'gems' ? 'Premium' : 'Padrão'}
                        </span>
                      </div>

                      <h4 className="font-display font-black text-xl text-white">{box.name}</h4>
                      <p className="text-xs text-slate-300 mt-1">{box.subtitle}</p>
                      <p className="text-[11px] text-slate-400 mt-2 font-mono-num">{box.oddsLabel}</p>
                    </div>

                    <button
                      type="button"
                      data-testid={`btn-open-${box.id}`}
                      disabled={isOpening}
                      onClick={() => handleOpenBetaBox(box)}
                      className="w-full py-3 rounded-xl font-display font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all text-slate-950"
                      style={{ backgroundColor: box.accentHex }}
                    >
                      {isOpening ? (
                        <>Girando Roleta...</>
                      ) : box.currency === 'gems' ? (
                        <>
                          <Gem className="w-4 h-4" /> Abrir Caixa ({box.cost} Diamantes)
                        </>
                      ) : (
                        <>
                          <Coins className="w-4 h-4" /> Abrir Caixa ({box.cost} Spike Coins)
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Resultado Animado da Caixa Gacha */}
            {lastBoxResult && lastBoxResult.ok && (
              <div
                data-testid="beta-gacha-box-result"
                className={`animate-spike-pop rounded-2xl p-5 border-2 flex flex-wrap items-center justify-between gap-4 ${
                  lastBoxResult.rarity === 'Lendário'
                    ? 'shadow-[0_0_35px_rgba(250,204,21,0.45)]'
                    : ''
                }`}
                style={{
                  backgroundColor: RARITY_COLORS[lastBoxResult.rarity].bg,
                  borderColor: RARITY_COLORS[lastBoxResult.rarity].border,
                }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-2xl border-2 border-white/60 flex items-center justify-center shrink-0 shadow-lg"
                    style={{ backgroundColor: lastBoxResult.rewardPreviewHex }}
                  >
                    <Star className="w-8 h-8 text-slate-950 fill-slate-950" />
                  </div>
                  <div>
                    <div
                      className="text-xs font-black uppercase tracking-widest"
                      style={{ color: RARITY_COLORS[lastBoxResult.rarity].text }}
                    >
                      RARIDADE SORTEADA: {lastBoxResult.rarity.toUpperCase()}!
                    </div>
                    <div className="font-display font-black text-2xl text-white">
                      {lastBoxResult.rewardName}
                    </div>
                    <div className="text-xs text-slate-200">{lastBoxResult.rewardDescription}</div>
                  </div>
                </div>
                <div className="px-3.5 py-2 rounded-xl bg-slate-950/60 border border-white/20 text-xs font-bold text-amber-300">
                  {lastBoxResult.isDuplicate
                    ? `Duplicata Evoluída (+${lastBoxResult.bonusCoins} Spike Coins)`
                    : 'Desbloqueado no Inventário!'}
                </div>
              </div>
            )}
          </section>

          {/* Seção Existente: Recrutamento Direto & Evolução RPG de Atletas */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-5 bg-[#0F172A] border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display font-bold text-xl text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                    Recrutamento de Atletas
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Lendário garantido no 8º giro · Pity: {rpgSave.pityCounter}/8
                  </p>
                </div>
              </div>

              <button
                type="button"
                data-testid="btn-gacha-pull"
                onClick={handleRollGacha}
                className={`w-full py-3.5 rounded-xl font-display font-bold text-base flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                  rpgSave.coins >= GACHA_COST
                    ? 'bg-[#F97316] hover:bg-[#EA580C] text-slate-950'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
              >
                <Sparkles className="w-5 h-5" />
                Recrutar Atleta ({GACHA_COST} Moedas)
              </button>

              {lastPull && (
                <div
                  data-testid="gacha-pull-result"
                  className="animate-spike-pop rounded-xl p-4 border-2 flex items-center gap-3.5"
                  style={{
                    backgroundColor: RARITY_COLORS[lastPull.pulledCard.rarity].bg,
                    borderColor: RARITY_COLORS[lastPull.pulledCard.rarity].border,
                  }}
                >
                  <AnimeAvatar characterId={lastPull.pulledCard.baseCharacterId} className="w-16 h-16 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[11px] font-bold uppercase tracking-wider"
                      style={{ color: RARITY_COLORS[lastPull.pulledCard.rarity].text }}
                    >
                      {lastPull.pulledCard.rarity} ·{' '}
                      {lastPull.isNew ? 'NOVO RECRUTA!' : `NÍVEL +1 (+${lastPull.bonusCoins} Moedas)`}
                    </div>
                    <div className="font-display font-bold text-lg text-white truncate">
                      {lastPull.pulledCard.name}
                    </div>
                    <div className="text-xs text-slate-200">{lastPull.pulledCard.specialty}</div>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Seus Atletas ({Object.keys(rpgSave.ownedCards).length}/{ATHLETE_CATALOG.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {ATHLETE_CATALOG.map((card) => {
                    const owned = rpgSave.ownedCards[card.cardId];
                    const isSelected = rpgSave.activeCardId === card.cardId;
                    const style = RARITY_COLORS[card.rarity];
                    return (
                      <button
                        key={card.cardId}
                        type="button"
                        disabled={!owned}
                        onClick={() => {
                          if (!owned) return;
                          soundEngine.playButtonClick();
                          onSelectCard(card.cardId);
                        }}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-colors ${
                          !owned
                            ? 'bg-[#0B1120] border-slate-800/80 opacity-45 cursor-not-allowed'
                            : isSelected
                              ? 'bg-[#1E293B] border-[#F97316] cursor-pointer'
                              : 'bg-[#0B1120] border-slate-700 hover:border-slate-500 cursor-pointer'
                        }`}
                      >
                        <AnimeAvatar characterId={card.baseCharacterId} className="w-10 h-10 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-bold" style={{ color: style.text }}>
                            {card.rarity} {owned ? `· Nv.${owned.level}` : '· Bloqueado'}
                          </div>
                          <div className="text-xs font-bold text-white truncate">{card.name}</div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-[#F97316] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Painel de Atributos RPG */}
            <section className="lg:col-span-7 bg-[#0F172A] border border-slate-800 rounded-2xl p-5 flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-4">
                  <AnimeAvatar characterId={activeCard.baseCharacterId} className="w-16 h-16" />
                  <div>
                    <span
                      className="inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase mb-1"
                      style={{
                        backgroundColor: rarityStyle.bg,
                        color: rarityStyle.text,
                        border: `1px solid ${rarityStyle.border}`,
                      }}
                    >
                      {activeCard.rarity} · Nível {activeOwned?.level ?? 1}
                    </span>
                    <h2 className="font-display font-bold text-2xl text-white leading-tight">{activeCard.name}</h2>
                    <p className="text-xs text-slate-400">{activeCard.specialty}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-[11px] font-mono-num">
                  <span className="px-2.5 py-1 rounded-lg bg-[#1E293B] border border-orange-500/40 text-orange-300">
                    Corte: {(physicsMults.spikeForceMultiplier * 100).toFixed(0)}%
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-[#1E293B] border border-amber-400/40 text-amber-300">
                    Salto Y: {(physicsMults.jumpForceMultiplier * 100).toFixed(0)}%
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-[#1E293B] border border-emerald-400/40 text-emerald-300">
                    Vel X: {(physicsMults.moveSpeedMultiplier * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {STAT_META.map((stat) => {
                  const val = effectiveStats[stat.key];
                  const upgCount = activeOwned?.upgrades[stat.key] ?? 0;
                  const statLevel = upgCount + 1;
                  const cost = getStatUpgradeCost(upgCount);
                  const maxed = upgCount >= MAX_STAT_UPGRADES;
                  const canAfford = rpgSave.coins >= cost && !maxed;

                  return (
                    <div
                      key={stat.key}
                      className="bg-[#1E293B] border border-slate-700 rounded-xl p-4 flex flex-col gap-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-display font-bold text-base text-white">{stat.label}</span>
                            <span
                              data-testid={`stat-level-${stat.key}`}
                              className="px-1.5 py-0.5 rounded bg-slate-900 text-[10px] font-mono-num font-bold text-amber-300"
                            >
                              Nv. {statLevel}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">{stat.desc}</div>
                        </div>
                        <div
                          className="font-display font-bold text-2xl tabular-nums text-white"
                          data-testid={`stat-value-${stat.key}`}
                        >
                          {val}
                        </div>
                      </div>

                      <div className="h-2.5 bg-slate-900 rounded-full overflow-hidden">
                        <div
                          className="h-full transition-all duration-200"
                          style={{
                            width: `${Math.min(100, (val / 160) * 100)}%`,
                            backgroundColor: stat.color,
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-400">
                          Upgrades: {upgCount}/{MAX_STAT_UPGRADES} ({stat.axisTag})
                        </span>
                        <button
                          type="button"
                          data-testid={`btn-upgrade-${stat.key}`}
                          disabled={maxed}
                          onClick={() => handleTryUpgradeStat(stat.key, stat.label, cost, maxed)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                            maxed
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              : canAfford
                                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                                : 'bg-slate-800 hover:bg-rose-950/80 text-slate-300 border border-slate-600'
                          }`}
                        >
                          <ArrowUpCircle className="w-3.5 h-3.5" />
                          {maxed ? 'MÁXIMO' : `+1 Nv (${cost} Moedas)`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ========================================================================
          ABA 3: SKINS E UNIFORMES
      ======================================================================== */}
      {activeStoreTab === 'outfits' && (
        <section
          data-testid="store-section-outfits"
          className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-black text-xl text-white flex items-center gap-2">
                <Shirt className="w-5 h-5 text-[#F97316]" />
                Skins e Uniformes de Quadra
              </h3>
              <p className="text-xs text-slate-400">
                Compre e equipe uniformes exclusivos (Neon Cyber, Samurai, Seleção Ouro, Fundador Beta) refletidos imediatamente no seu atleta 3D.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {outfitItems.map((item) => {
              const isUnlocked = unlockedItems.includes(item.id);
              const isEquipped = (rpgSave.equippedOutfitId ?? 'outfit_default') === item.id;
              const currency = item.currency ?? 'coins';
              const canBuy = currency === 'gems' ? gemsBalance >= item.cost : rpgSave.coins >= item.cost;
              const rarityColors = RARITY_COLORS[item.rarity ?? 'Comum'];

              return (
                <div
                  key={item.id}
                  data-testid={`shop-item-${item.id}`}
                  className={`rounded-2xl p-4 border-2 flex flex-col justify-between gap-4 ${
                    isEquipped
                      ? 'bg-[#1E293B] border-[#F97316]'
                      : 'bg-[#1E293B]/80 border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className="w-14 h-14 rounded-2xl shrink-0 border-2 border-white/30 shadow-inner flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${item.previewHex} 50%, ${item.secondaryHex ?? '#0F172A'} 100%)`,
                      }}
                    >
                      <Shirt className="w-7 h-7 text-white drop-shadow" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className="px-2 py-0.5 rounded text-[9px] font-black uppercase"
                          style={{ backgroundColor: rarityColors.bg, color: rarityColors.text }}
                        >
                          {item.rarity}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-slate-400">Uniforme 3D</span>
                      </div>
                      <div className="font-display font-black text-base text-white truncate">{item.name}</div>
                      <p className="text-xs text-slate-300 leading-snug mt-1">{item.description}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid={`btn-shop-item-${item.id}`}
                    onClick={() => handleTryBuyItem(item, isUnlocked)}
                    className={`w-full py-2.5 rounded-xl text-xs font-display font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      isEquipped
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                        : isUnlocked
                          ? 'bg-sky-400 hover:bg-sky-300 text-slate-950'
                          : canBuy
                            ? currency === 'gems'
                              ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
                              : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                            : 'bg-slate-800 hover:bg-rose-950/80 text-slate-300 border border-slate-600'
                    }`}
                  >
                    {isEquipped ? (
                      <>
                        <Check className="w-4 h-4" /> Equipado
                      </>
                    ) : isUnlocked ? (
                      'Equipar'
                    ) : currency === 'gems' ? (
                      <>
                        <Gem className="w-4 h-4" /> Comprar ({item.cost} Diamantes)
                      </>
                    ) : (
                      <>
                        <Coins className="w-4 h-4" /> Comprar ({item.cost} Coins)
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ========================================================================
          ABA 4: BOLAS E RASTROS (TRAILS)
      ======================================================================== */}
      {activeStoreTab === 'balls' && (
        <section
          data-testid="store-section-balls"
          className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-black text-xl text-white flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-400" />
                Bolas Temáticas & Rastros de Corte (Trails)
              </h3>
              <p className="text-xs text-slate-400">
                Mudam o visual da bola 3D e adicionam um rastro luminoso colorido quando a bola é cortada na partida.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-300 bg-[#1E293B] px-3 py-1.5 rounded-xl border border-slate-700">
              <span>Rastro Equipado:</span>
              <span
                className="inline-block w-4 h-4 rounded-full border border-white shadow"
                style={{ backgroundColor: rpgSave.equippedBallTrailColor ?? rpgSave.equippedBallColor ?? '#FACC15' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ballItems.map((item) => {
              const isUnlocked = unlockedItems.includes(item.id);
              const isEquipped = isBallItemEquipped(item);
              const currency = item.currency ?? 'coins';
              const canBuy = currency === 'gems' ? gemsBalance >= item.cost : rpgSave.coins >= item.cost;
              const rarityColors = RARITY_COLORS[item.rarity ?? 'Comum'];

              return (
                <div
                  key={item.id}
                  data-testid={`shop-item-${item.id}`}
                  className={`rounded-2xl p-4 border-2 flex flex-col justify-between gap-4 ${
                    isEquipped
                      ? 'bg-[#1E293B] border-amber-400'
                      : 'bg-[#1E293B]/80 border-slate-700'
                  }`}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span
                        className="px-2 py-0.5 rounded text-[9px] font-black uppercase"
                        style={{ backgroundColor: rarityColors.bg, color: rarityColors.text }}
                      >
                        {item.rarity}
                      </span>
                      <span className="text-[10px] font-bold text-amber-300 flex items-center gap-1">
                        <Flame className="w-3 h-3" /> Rastro 3D
                      </span>
                    </div>

                    {/* Preview da Bola + Rastro Luminoso */}
                    <div className="h-16 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center px-4 relative overflow-hidden">
                      <div
                        className="h-3 flex-1 rounded-l-full opacity-75 blur-[1px]"
                        style={{
                          background: `linear-gradient(90deg, transparent 0%, ${item.trailHex ?? item.previewHex} 100%)`,
                        }}
                      />
                      <div
                        className="w-11 h-11 rounded-full border-2 border-white/80 shrink-0 shadow-lg"
                        style={{
                          background: `radial-gradient(circle at 30% 30%, ${item.previewHex}, ${item.secondaryHex ?? '#0F172A'})`,
                          boxShadow: `0 0 16px ${item.trailHex ?? item.previewHex}`,
                        }}
                      />
                    </div>

                    <div>
                      <div className="font-display font-black text-base text-white truncate">{item.name}</div>
                      <p className="text-xs text-slate-300 leading-snug mt-1">{item.description}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid={`btn-shop-item-${item.id}`}
                    onClick={() => handleTryBuyItem(item, isUnlocked)}
                    className={`w-full py-2.5 rounded-xl text-xs font-display font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      isEquipped
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                        : isUnlocked
                          ? 'bg-sky-400 hover:bg-sky-300 text-slate-950'
                          : canBuy
                            ? currency === 'gems'
                              ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
                              : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                            : 'bg-slate-800 hover:bg-rose-950/80 text-slate-300 border border-slate-600'
                    }`}
                  >
                    {isEquipped ? (
                      <>
                        <Check className="w-4 h-4" /> Equipado
                      </>
                    ) : isUnlocked ? (
                      'Equipar'
                    ) : currency === 'gems' ? (
                      <>
                        <Gem className="w-4 h-4" /> Comprar ({item.cost} Diamantes)
                      </>
                    ) : (
                      <>
                        <Coins className="w-4 h-4" /> Comprar ({item.cost} Coins)
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
