import {
  BOSS_LIFESTEAL_PENALTY,
  BOSS_TIME_LIMIT,
  CHAPTER_BOSS_GOLD_MULTIPLIER,
  CHAPTER_CLEAR_DIAMOND_REWARD,
  COMPANIONS,
  COMPANION_DRAW_COST,
  COMPANION_LEVELUP_COST_GROWTH,
  COMPANION_LEVELUP_COST_START,
  COMPANION_LEVELUP_EFFECT_GROWTH,
  COMPANION_MAX_LEVEL,
  COMPANION_TIER_RATE,
  DIAMOND_DROP_CHANCE,
  ENEMIES_PER_STAGE,
  ENEMY_ATK_GROWTH,
  ENEMY_BASE_ATTACK,
  ENEMY_BASE_HP,
  ENEMY_FAMILIES,
  ENEMY_HP_GROWTH,
  GOLD_BASE,
  LIFESTEAL_CAP_PER_SECOND,
  GOLD_GROWTH,
  MAX_CHAPTER,
  MAX_STAGE,
  MID_BOSS_MULTIPLIER,
  PLAYER_BASE_ATTACK,
  PLAYER_BASE_HP,
  SAVE_VERSION,
  STORAGE_KEY,
  chapterBossMultiplier
} from "./config";
import { COMPANION_DUPLICATE_FRAGMENT_REWARD, COMPANION_SHOP_ITEMS, FRAGMENT_TO_COMPANION_COIN, formatDailyResetKey, formatWeeklyResetKey } from "./companionShop";
import { COMBAT_SKILLS, getCombatSkillById, skillUnlockCost, skillUpgradeCost, skillValuesAtLevel } from "./skills";
import {
  UPGRADE_ORDER,
  UPGRADE_RULES,
  attackMultiplier,
  attackSpeedValue,
  critDamagePercent,
  critRatePercent,
  defaultUpgradeLevels,
  extraHitCountValue,
  extraHitRatePercent,
  hpMultiplier,
  lifestealAmountPercent,
  lifestealRatePercent,
  upgradeCostAtLevel,
  upgradeCurrentNumericValue,
  upgradeUpgradableCount
} from "./upgrades";
import type {
  ActiveSkillBuffView,
  CoinShopGoldBoostState,
  CombatSkillDefinition,
  CompanionDefinition,
  CompanionEffect,
  CompanionRuntime,
  CompanionShopItemView,
  CompanionTier,
  DerivedStats,
  DrawResult,
  EnemyState,
  EnemyType,
  GameState,
  Notice,
  PersistedGameData,
  SkillDisplayInfo,
  SkillRuntimeState,
  SkillStatValues,
  ShopPurchaseHistoryEntry,
  UpgradeDisplayInfo,
  UpgradeKey,
  UpgradeLevels
} from "./types";

export interface ActionFeedback {
  ok: boolean;
  message: string;
  draws?: DrawResult[];
}

const companionById = new Map<string, CompanionDefinition>(COMPANIONS.map((v) => [v.id, v]));
const allSkillIds = new Set(COMBAT_SKILLS.map((v) => v.id));

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const floor = (v: number) => Math.floor(v);

function growthMultiplierByStage(stageIndex: number, early: number, mid: number, late: number): number {
  const steps = Math.max(0, floor(stageIndex) - 1);
  const earlySteps = clamp(steps, 0, 99);
  const midSteps = clamp(steps - 99, 0, 100);
  const lateSteps = Math.max(0, steps - 199);
  return Math.pow(early, earlySteps) * Math.pow(mid, midSteps) * Math.pow(late, lateSteps);
}

const randomizeDamage = (raw: number) => Math.max(1, floor(Math.max(1, raw) * (0.95 + Math.random() * 0.1)));

function sumSequentialCost(count: number, fn: (idx: number) => number): number {
  let total = 0;
  for (let i = 0; i < count; i += 1) total += Math.max(0, floor(fn(i)));
  return total;
}

function emptyEffect(): Required<CompanionEffect> {
  return { atk: 0, finalAtk: 0, hp: 0, speed: 0, crit: 0, critDmg: 0, cleave: 0, lifesteal: 0, gold: 0 };
}

function addEffect(target: Required<CompanionEffect>, base: CompanionEffect, scale: number): void {
  target.atk += (base.atk ?? 0) * scale;
  target.finalAtk += (base.finalAtk ?? 0) * scale;
  target.hp += (base.hp ?? 0) * scale;
  target.speed += (base.speed ?? 0) * scale;
  target.crit += (base.crit ?? 0) * scale;
  target.critDmg += (base.critDmg ?? 0) * scale;
  target.cleave += (base.cleave ?? 0) * scale;
  target.lifesteal += (base.lifesteal ?? 0) * scale;
  target.gold += (base.gold ?? 0) * scale;
}

const effectScale = (tier: 1 | 2 | 3 | 4, level: number, scope: "owned" | "equipped") => (level <= 0 ? 0 : 1 + COMPANION_LEVELUP_EFFECT_GROWTH[tier][scope] * Math.max(0, level - 1));

const stageOrdinal = (chapter: number, stage: number) => (clamp(floor(chapter), 1, MAX_CHAPTER) - 1) * MAX_STAGE + clamp(floor(stage), 1, MAX_STAGE);
const expNeed = (level: number) => floor(12 * Math.pow(1.5, Math.max(0, level - 1)));

function pickTierByRate(): 1 | 2 | 3 | 4 {
  const roll = Math.random();
  let acc = 0;
  for (const tier of [1, 2, 3, 4] as const) {
    acc += COMPANION_TIER_RATE[tier];
    if (roll <= acc) return tier;
  }
  return 1;
}

function createInitialEnemy(): EnemyState {
  return {
    type: "normal",
    name: ENEMY_FAMILIES[0].normal,
    familyId: ENEMY_FAMILIES[0].id,
    atk: ENEMY_BASE_ATTACK,
    hp: ENEMY_BASE_HP,
    hpMax: ENEMY_BASE_HP,
    attackInterval: 1.2,
    spritePath: ENEMY_FAMILIES[0].sprite.normal
  };
}

function emptySkillValues(): Required<SkillStatValues> {
  return {
    attackRate: 0,
    attackSpeedRate: 0,
    critChance: 0,
    critDamage: 0,
    extraHitRate: 0,
    lifestealAmount: 0,
    damageReduction: 0,
    healMaxHpInstant: 0,
    lethalHealMaxHp: 0,
    goldGain: 0,
    killReward: 0
  };
}

const defaultSkillRuntime = (): SkillRuntimeState => ({ cooldownRemain: 0, durationRemain: 0, active: false, lastBossSpawnSeq: -1 });

export class IdleGameEngine {
  private heroAttackTimer = 0;
  private enemyAttackTimer = 0;
  private noticeRemain = 0;
  private onTransitionDone: (() => void) | null = null;
  private lifestealSecondBucket = -1;
  private lifestealHealedInBucket = 0;

  state: GameState = {
    gold: 0,
    diamonds: 0,
    chapter: 1,
    stage: 1,
    stageKillCount: 0,
    level: 1,
    exp: 0,
    heroHp: PLAYER_BASE_HP,
    bossTimeLeft: 0,
    drawCount: 0,
    upgrades: defaultUpgradeLevels(),
    skillSlotsUnlocked: 1,
    equippedSkillIds: [],
    unlockedSkills: [],
    skillLevels: {},
    skillRuntime: {},
    equippedCompanionIds: [],
    companionRuntime: {},
    companionCoins: 0,
    companionGrowthTickets: 0,
    shopPurchaseHistory: {},
    activeCoinShopGoldBoost: null,
    freeSkillChapter2Granted: false,
    enemy: createInitialEnemy(),
    notice: null,
    transitionSecLeft: 0,
    enemySpawnSeq: 0
  };

  constructor() {
    this.spawnNormalEnemy();
    this.grantInitialFreeSkillIfNeeded();
    this.state.heroHp = this.getDerivedStats().maxHp;
  }

  getStorageKey(): string { return STORAGE_KEY; }
  getCompanions(): CompanionDefinition[] { return COMPANIONS; }
  getCompanionRuntime(id: string): CompanionRuntime { return this.state.companionRuntime[id] ?? { level: 0, shards: 0 }; }
  isCompanionOwned(id: string): boolean { return this.getCompanionRuntime(id).level > 0; }
  getClearedChapterCount(): number { return Math.max(0, this.state.chapter - 1); }
  getUnlockedCompanionSlots(): number { const c = this.getClearedChapterCount(); return c >= 7 ? 3 : c >= 3 ? 2 : 1; }
  getUnlockedSkillSlots(): number { const c = this.getClearedChapterCount(); return c >= 7 ? 3 : c >= 3 ? 2 : 1; }
  private nowMs(): number { return Date.now(); }
  private currentDailyKey(nowMs = this.nowMs()): string { return formatDailyResetKey(nowMs); }
  private currentWeeklyKey(nowMs = this.nowMs()): string { return formatWeeklyResetKey(nowMs); }
  private fragmentNeedForLevel(level: number): number { return clamp(floor(level) + 1, 1, 10); }

  getCompanionCoins(): number { return Math.max(0, floor(this.state.companionCoins)); }
  getCompanionGrowthTickets(): number { return Math.max(0, floor(this.state.companionGrowthTickets)); }

  private ensureShopHistoryEntry(itemId: string, nowMs = this.nowMs()): ShopPurchaseHistoryEntry {
    this.resetShopPurchaseHistoryIfNeeded(nowMs);
    const dailyKey = this.currentDailyKey(nowMs);
    const weeklyKey = this.currentWeeklyKey(nowMs);
    const current = this.state.shopPurchaseHistory[itemId];
    if (current) return current;
    const created: ShopPurchaseHistoryEntry = {
      itemId,
      dailyPurchasedCount: 0,
      weeklyPurchasedCount: 0,
      lastDailyResetAt: dailyKey,
      lastWeeklyResetAt: weeklyKey
    };
    this.state.shopPurchaseHistory[itemId] = created;
    return created;
  }

  private resetShopPurchaseHistoryIfNeeded(nowMs = this.nowMs()): void {
    const dailyKey = this.currentDailyKey(nowMs);
    const weeklyKey = this.currentWeeklyKey(nowMs);
    const next: Record<string, ShopPurchaseHistoryEntry> = {};

    for (const [itemId, raw] of Object.entries(this.state.shopPurchaseHistory ?? {})) {
      const v = (raw ?? {}) as Partial<ShopPurchaseHistoryEntry>;
      const entry: ShopPurchaseHistoryEntry = {
        itemId,
        dailyPurchasedCount: Math.max(0, floor(Number(v.dailyPurchasedCount ?? 0))),
        weeklyPurchasedCount: Math.max(0, floor(Number(v.weeklyPurchasedCount ?? 0))),
        lastDailyResetAt: typeof v.lastDailyResetAt === "string" ? v.lastDailyResetAt : dailyKey,
        lastWeeklyResetAt: typeof v.lastWeeklyResetAt === "string" ? v.lastWeeklyResetAt : weeklyKey
      };

      if (entry.lastDailyResetAt !== dailyKey) {
        entry.dailyPurchasedCount = 0;
        entry.lastDailyResetAt = dailyKey;
      }
      if (entry.lastWeeklyResetAt !== weeklyKey) {
        entry.weeklyPurchasedCount = 0;
        entry.lastWeeklyResetAt = weeklyKey;
      }

      next[itemId] = entry;
    }

    this.state.shopPurchaseHistory = next;
  }

  private getActiveCoinShopGoldBoostRate(nowMs = this.nowMs()): number {
    const active = this.state.activeCoinShopGoldBoost;
    if (!active) return 0;
    if (active.endAt <= nowMs) {
      this.state.activeCoinShopGoldBoost = null;
      return 0;
    }
    return clamp(active.rate, 0, 5);
  }

  getCompanionCoinBoostText(nowMs = this.nowMs()): string {
    const active = this.state.activeCoinShopGoldBoost;
    const rate = this.getActiveCoinShopGoldBoostRate(nowMs);
    if (!active || rate <= 0) return "없음";
    const remainSec = Math.max(0, Math.ceil((active.endAt - nowMs) / 1000));
    const mm = `${Math.floor(remainSec / 60)}`.padStart(2, "0");
    const ss = `${remainSec % 60}`.padStart(2, "0");
    return `+${Math.round(rate * 100)}% (${mm}:${ss})`;
  }

  getCompanionChoicesByTier(tier: CompanionTier): CompanionDefinition[] {
    return COMPANIONS.filter((v) => v.tier === tier);
  }

  private addCompanionFragments(id: string, amount: number): { addedFragments: number; overflowFragments: number; coinGain: number } {
    const def = companionById.get(id);
    if (!def) return { addedFragments: 0, overflowFragments: 0, coinGain: 0 };

    const gain = Math.max(0, floor(amount));
    if (gain <= 0) return { addedFragments: 0, overflowFragments: 0, coinGain: 0 };

    const rt = this.getCompanionRuntime(id);
    const convertRate = FRAGMENT_TO_COMPANION_COIN[def.tier];

    if (rt.level >= COMPANION_MAX_LEVEL) {
      const coinGain = gain * convertRate;
      this.state.companionCoins += coinGain;
      return { addedFragments: 0, overflowFragments: gain, coinGain };
    }

    if (rt.level <= 0) {
      this.state.companionRuntime[id] = { level: 0, shards: rt.shards + gain };
      return { addedFragments: gain, overflowFragments: 0, coinGain: 0 };
    }

    const need = this.fragmentNeedForLevel(rt.level);
    const room = Math.max(0, need - rt.shards);
    const added = Math.min(gain, room);
    const overflow = gain - added;

    this.state.companionRuntime[id] = { level: rt.level, shards: rt.shards + added };

    const coinGain = overflow * convertRate;
    if (coinGain > 0) this.state.companionCoins += coinGain;

    return { addedFragments: added, overflowFragments: overflow, coinGain };
  }

  private grantDuplicateCompanionReward(id: string): { addedFragments: number; overflowFragments: number; coinGain: number } {
    const def = companionById.get(id);
    if (!def) return { addedFragments: 0, overflowFragments: 0, coinGain: 0 };
    const amount = COMPANION_DUPLICATE_FRAGMENT_REWARD[def.tier];
    return this.addCompanionFragments(id, amount);
  }

  getCompanionShopDisplay(): CompanionShopItemView[] {
    this.resetShopPurchaseHistoryIfNeeded();
    const currentChapter = clamp(floor(this.state.chapter), 1, MAX_CHAPTER);

    return COMPANION_SHOP_ITEMS.map((item) => {
      const history = this.ensureShopHistoryEntry(item.id);
      const unlocked = item.isEnabled && currentChapter >= item.unlockCondition.chapterClear;
      const dailyRemain = item.dailyLimit === null ? null : Math.max(0, item.dailyLimit - history.dailyPurchasedCount);
      const weeklyRemain = item.weeklyLimit === null ? null : Math.max(0, item.weeklyLimit - history.weeklyPurchasedCount);
      let reason: string | null = null;

      if (!item.isEnabled) reason = "비활성화";
      else if (!unlocked) reason = `챕터 ${item.unlockCondition.chapterClear} 도달 필요`;
      else if (dailyRemain !== null && dailyRemain <= 0) reason = "일일 구매 제한 도달";
      else if (weeklyRemain !== null && weeklyRemain <= 0) reason = "주간 구매 제한 도달";
      else if (this.getCompanionCoins() < item.price) reason = "코인 부족";

      return {
        id: item.id,
        name: item.name,
        category: item.category,
        price: item.price,
        rewardType: item.rewardType,
        rewardValue: item.rewardValue,
        unlocked,
        unlockText: unlocked ? "해금됨" : `챕터 ${item.unlockCondition.chapterClear} 도달 필요`,
        buyable: reason === null,
        buyBlockedReason: reason,
        dailyLimit: item.dailyLimit,
        dailyRemain,
        weeklyLimit: item.weeklyLimit,
        weeklyRemain
      };
    });
  }

  purchaseCompanionShopItem(itemId: string, selectedCompanionId?: string): ActionFeedback {
    const item = COMPANION_SHOP_ITEMS.find((v) => v.id === itemId);
    if (!item) return { ok: false, message: "존재하지 않는 상품입니다" };
    if (!item.isEnabled) return { ok: false, message: "비활성화된 상품입니다" };

    const currentChapter = clamp(floor(this.state.chapter), 1, MAX_CHAPTER);
    if (currentChapter < item.unlockCondition.chapterClear) {
      return { ok: false, message: `챕터 ${item.unlockCondition.chapterClear} 도달 후 구매 가능합니다` };
    }

    this.resetShopPurchaseHistoryIfNeeded();
    const history = this.ensureShopHistoryEntry(item.id);

    if (item.dailyLimit !== null && history.dailyPurchasedCount >= item.dailyLimit) {
      return { ok: false, message: "일일 구매 제한에 도달했습니다" };
    }

    if (item.weeklyLimit !== null && history.weeklyPurchasedCount >= item.weeklyLimit) {
      return { ok: false, message: "주간 구매 제한에 도달했습니다" };
    }

    if (this.state.companionCoins < item.price) {
      return { ok: false, message: "동료 코인이 부족합니다" };
    }

    if (item.rewardType === "tier_fragment_selector") {
      const tier = item.rewardValue.tier as CompanionTier | undefined;
      if (!tier) return { ok: false, message: "상품 설정 오류입니다" };
      if (!selectedCompanionId) return { ok: false, message: "동료를 선택해 주세요" };
      const target = companionById.get(selectedCompanionId);
      if (!target || target.tier !== tier) return { ok: false, message: "선택 가능한 동료가 아닙니다" };
    }

    this.state.companionCoins -= item.price;

    let message = `${item.name} 구매 완료`;
    if (item.rewardType === "tier_fragment_selector") {
      const target = companionById.get(selectedCompanionId as string);
      const grant = this.addCompanionFragments(selectedCompanionId as string, item.rewardValue.amount ?? 1);
      message = `${target?.name ?? "동료"} 조각 +${grant.addedFragments}`;
      if (grant.coinGain > 0) message += ` / 코인 +${grant.coinGain}`;
    } else if (item.rewardType === "tier_fragment_random") {
      const tier = item.rewardValue.tier as CompanionTier | undefined;
      const pool = tier ? this.getCompanionChoicesByTier(tier) : [];
      if (pool.length <= 0) return { ok: false, message: "상품 설정 오류입니다" };
      const pick = pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
      const grant = this.addCompanionFragments(pick.id, item.rewardValue.amount ?? 1);
      message = `${pick.name} 조각 +${grant.addedFragments}`;
      if (grant.coinGain > 0) message += ` / 코인 +${grant.coinGain}`;
    } else if (item.rewardType === "gold_boost_small" || item.rewardType === "gold_boost_medium") {
      const rate = item.rewardValue.goldBoostRate ?? 0;
      const durationSec = item.rewardValue.durationSec ?? 0;
      this.state.activeCoinShopGoldBoost = {
        rate,
        endAt: this.nowMs() + Math.max(0, durationSec) * 1000
      } as CoinShopGoldBoostState;
      message = `${item.name} 적용 (+${Math.round(rate * 100)}%, ${Math.floor(durationSec / 60)}분)`;
    } else if (item.rewardType === "companion_growth_ticket") {
      const amount = Math.max(1, floor(item.rewardValue.amount ?? 1));
      this.state.companionGrowthTickets += amount;
      message = `동료 성장 촉진제 +${amount}`;
    }

    history.dailyPurchasedCount += 1;
    history.weeklyPurchasedCount += 1;

    return { ok: true, message };
  }

  private companionRoleText(role: CompanionDefinition["role"]): string {
    if (role === "atk") return "공격형";
    if (role === "hp") return "방어형";
    if (role === "speed") return "공속형";
    if (role === "crit") return "치명형";
    return "유틸형";
  }

  private scaledCompanionEffect(def: CompanionDefinition, level: number, scope: "owned" | "equipped"): CompanionEffect {
    const lv = clamp(floor(level), 1, COMPANION_MAX_LEVEL);
    const base = scope === "owned" ? def.baseOwnedEffects : def.baseEquippedEffects;
    const growthRate = scope === "owned" ? def.ownedGrowthRate : def.equippedGrowthRate;
    const scale = 1 + growthRate * Math.max(0, lv - 1);
    return {
      atk: (base.atk ?? 0) * scale,
      finalAtk: (base.finalAtk ?? 0) * scale,
      hp: (base.hp ?? 0) * scale,
      speed: (base.speed ?? 0) * scale,
      crit: (base.crit ?? 0) * scale,
      critDmg: (base.critDmg ?? 0) * scale,
      cleave: (base.cleave ?? 0) * scale,
      lifesteal: (base.lifesteal ?? 0) * scale,
      gold: (base.gold ?? 0) * scale
    };
  }

  private diffCompanionEffect(next: CompanionEffect, current: CompanionEffect): CompanionEffect {
    return {
      atk: (next.atk ?? 0) - (current.atk ?? 0),
      finalAtk: (next.finalAtk ?? 0) - (current.finalAtk ?? 0),
      hp: (next.hp ?? 0) - (current.hp ?? 0),
      speed: (next.speed ?? 0) - (current.speed ?? 0),
      crit: (next.crit ?? 0) - (current.crit ?? 0),
      critDmg: (next.critDmg ?? 0) - (current.critDmg ?? 0),
      cleave: (next.cleave ?? 0) - (current.cleave ?? 0),
      lifesteal: (next.lifesteal ?? 0) - (current.lifesteal ?? 0),
      gold: (next.gold ?? 0) - (current.gold ?? 0)
    };
  }

  getCompanionDetailDisplay(id: string) {
    const def = companionById.get(id);
    if (!def) return null;

    const rt = this.getCompanionRuntime(id);
    const owned = rt.level > 0;
    const equipped = this.state.equippedCompanionIds.includes(id);
    const displayLevel = owned ? rt.level : 1;
    const nextLevel = owned && rt.level < COMPANION_MAX_LEVEL ? rt.level + 1 : null;

    const ownedCurrent = this.scaledCompanionEffect(def, displayLevel, "owned");
    const equippedCurrent = this.scaledCompanionEffect(def, displayLevel, "equipped");
    const ownedNext = nextLevel ? this.scaledCompanionEffect(def, nextLevel, "owned") : null;
    const equippedNext = nextLevel ? this.scaledCompanionEffect(def, nextLevel, "equipped") : null;

    return {
      id: def.id,
      name: def.name,
      tier: def.tier,
      role: def.role,
      roleText: this.companionRoleText(def.role),
      owned,
      equipped,
      level: rt.level,
      displayLevel,
      fragments: rt.shards,
      fragmentsNeed: owned && rt.level < COMPANION_MAX_LEVEL ? this.fragmentNeedForLevel(rt.level) : 0,
      growthTickets: this.state.companionGrowthTickets,
      ownedCurrent,
      equippedCurrent,
      nextLevel,
      ownedNext,
      equippedNext,
      ownedDelta: ownedNext ? this.diffCompanionEffect(ownedNext, ownedCurrent) : null,
      equippedDelta: equippedNext ? this.diffCompanionEffect(equippedNext, equippedCurrent) : null
    };
  }

  private normalizeCompanionState(): void {
    const valid = new Set(COMPANIONS.map((v) => v.id));
    const normalized: Record<string, CompanionRuntime> = {};

    for (const [id, raw] of Object.entries(this.state.companionRuntime ?? {})) {
      if (!valid.has(id)) continue;

      let level = 0;
      let shards = 0;

      if (typeof raw === "number") {
        level = raw;
      } else if (raw && typeof raw === "object") {
        const rt = raw as Partial<CompanionRuntime>;
        level = Number(rt.level ?? 0);
        shards = Number(rt.shards ?? 0);
      }

      const lv = clamp(floor(level), 0, COMPANION_MAX_LEVEL);
      const sh = Math.max(0, floor(shards));
      if (lv <= 0 && sh <= 0) continue;
      normalized[id] = { level: lv, shards: sh };
    }

    this.state.companionRuntime = normalized;
    this.state.equippedCompanionIds = Array.from(new Set(this.state.equippedCompanionIds)).filter((id) => this.isCompanionOwned(id)).slice(0, this.getUnlockedCompanionSlots());
  }

  private normalizeSkillState(): void {
    this.state.unlockedSkills = Array.from(new Set(this.state.unlockedSkills)).filter((id) => allSkillIds.has(id));

    const levels: Record<string, number> = {};
    for (const id of this.state.unlockedSkills) {
      const def = getCombatSkillById(id);
      if (!def) continue;
      levels[id] = clamp(floor(this.state.skillLevels[id] ?? 1), 1, def.maxLevel);
    }
    this.state.skillLevels = levels;

    const runtime: Record<string, SkillRuntimeState> = {};
    for (const id of COMBAT_SKILLS.map((v) => v.id)) {
      const r = this.state.skillRuntime[id];
      runtime[id] = { cooldownRemain: Math.max(0, r?.cooldownRemain ?? 0), durationRemain: Math.max(0, r?.durationRemain ?? 0), active: (r?.active ?? false) && (r?.durationRemain ?? 0) > 0, lastBossSpawnSeq: r?.lastBossSpawnSeq ?? -1 };
    }
    this.state.skillRuntime = runtime;

    this.state.skillSlotsUnlocked = this.getUnlockedSkillSlots();
    this.state.equippedSkillIds = Array.from(new Set(this.state.equippedSkillIds)).filter((id) => this.state.unlockedSkills.includes(id)).slice(0, this.state.skillSlotsUnlocked);
  }

  private ensureSkillRuntime(id: string): SkillRuntimeState {
    if (!this.state.skillRuntime[id]) this.state.skillRuntime[id] = defaultSkillRuntime();
    return this.state.skillRuntime[id];
  }

  private grantInitialFreeSkillIfNeeded(): void {
    this.normalizeSkillState();
    if (this.state.unlockedSkills.length > 0) return;
    this.state.unlockedSkills.push("skill-berserk");
    this.state.skillLevels["skill-berserk"] = 1;
    this.normalizeSkillState();
    this.state.equippedSkillIds = ["skill-berserk"];
    this.normalizeSkillState();
  }

  private companionEffectTotalsSplit(): { owned: Required<CompanionEffect>; equipped: Required<CompanionEffect>; total: Required<CompanionEffect> } {
    this.normalizeCompanionState();
    const owned = emptyEffect();
    const equipped = emptyEffect();
    for (const def of COMPANIONS) {
      const rt = this.getCompanionRuntime(def.id);
      if (rt.level <= 0) continue;
      addEffect(owned, def.baseOwnedEffects, effectScale(def.tier, rt.level, "owned"));
    }
    for (const id of this.state.equippedCompanionIds) {
      const def = companionById.get(id);
      if (!def) continue;
      const rt = this.getCompanionRuntime(id);
      if (rt.level <= 0) continue;
      addEffect(equipped, def.baseEquippedEffects, effectScale(def.tier, rt.level, "equipped"));
    }

    const total = emptyEffect();
    addEffect(total, owned, 1);
    addEffect(total, equipped, 1);
    return { owned, equipped, total };
  }

  private companionEffectTotals(): Required<CompanionEffect> {
    return this.companionEffectTotalsSplit().total;
  }

  private companionEffectText(effect: Required<CompanionEffect>): string {
    const parts: string[] = [];
    if (effect.atk > 0) parts.push(`공격력 +${Math.round(effect.atk * 100)}%`);
    if (effect.finalAtk > 0) parts.push(`최종공격력 +${Math.round(effect.finalAtk * 100)}%`);
    if (effect.hp > 0) parts.push(`체력 +${Math.round(effect.hp * 100)}%`);
    if (effect.speed > 0) parts.push(`공속 +${Math.round(effect.speed * 100)}%`);
    if (effect.crit > 0) parts.push(`치확 +${Math.round(effect.crit * 100)}%p`);
    if (effect.critDmg > 0) parts.push(`치피 +${Math.round(effect.critDmg * 100)}%p`);
    if (effect.gold > 0) parts.push(`골드 +${Math.round(effect.gold * 100)}%`);
    return parts.length ? parts.join(", ") : "없음";
  }

  getCompanionEffectSummarySplitText(): { owned: string; equipped: string; total: string } {
    const split = this.companionEffectTotalsSplit();
    return {
      owned: this.companionEffectText(split.owned),
      equipped: this.companionEffectText(split.equipped),
      total: this.companionEffectText(split.total)
    };
  }

  private activeSkillTotals(): { values: Required<SkillStatValues>; views: ActiveSkillBuffView[] } {
    this.normalizeSkillState();
    const values = emptySkillValues();
    const views: ActiveSkillBuffView[] = [];

    for (const id of this.state.equippedSkillIds) {
      const rt = this.ensureSkillRuntime(id);
      if (!rt.active || rt.durationRemain <= 0) continue;
      const def = getCombatSkillById(id);
      if (!def) continue;
      const v = skillValuesAtLevel(def, this.state.skillLevels[id] ?? 1);

      values.attackRate = Math.max(values.attackRate, v.attackRate);
      values.attackSpeedRate = Math.max(values.attackSpeedRate, v.attackSpeedRate);
      values.critChance = Math.max(values.critChance, v.critChance);
      values.critDamage = Math.max(values.critDamage, v.critDamage);
      values.extraHitRate = Math.max(values.extraHitRate, v.extraHitRate);
      values.lifestealAmount = Math.max(values.lifestealAmount, v.lifestealAmount);
      values.damageReduction = Math.max(values.damageReduction, v.damageReduction);
      values.goldGain = Math.max(values.goldGain, v.goldGain);
      values.killReward = Math.max(values.killReward, v.killReward);

      const summary: string[] = [];
      if (v.attackRate > 0) summary.push(`공격 +${Math.round(v.attackRate * 100)}%`);
      if (v.attackSpeedRate > 0) summary.push(`공속 +${Math.round(v.attackSpeedRate * 100)}%`);
      if (v.critChance > 0) summary.push(`치확 +${Math.round(v.critChance * 100)}%`);
      if (v.critDamage > 0) summary.push(`치피 +${Math.round(v.critDamage * 100)}%`);
      if (v.extraHitRate > 0) summary.push(`추가타확률 +${Math.round(v.extraHitRate * 100)}%`);
      if (v.lifestealAmount > 0) summary.push(`흡혈량 +${Math.round(v.lifestealAmount * 100)}%`);
      if (v.damageReduction > 0) summary.push(`피해감소 ${Math.round(v.damageReduction * 100)}%`);
      if (v.goldGain > 0) summary.push(`골드 +${Math.round(v.goldGain * 100)}%`);
      if (v.killReward > 0) summary.push(`처치보상 +${Math.round(v.killReward * 100)}%`);

      views.push({ id, name: def.name, remainSec: rt.durationRemain, summary: summary.join(", ") || "효과 없음" });
    }

    values.damageReduction = Math.min(0.7, values.damageReduction);
    return { values, views: views.sort((a, b) => b.remainSec - a.remainSec) };
  }

  getActiveSkillBuffs(): ActiveSkillBuffView[] { return this.activeSkillTotals().views; }

  getDerivedStats(): DerivedStats {
    const c = this.companionEffectTotals();
    const s = this.activeSkillTotals().values;
    const coinShopGoldBoostRate = this.getActiveCoinShopGoldBoostRate();
    const u = this.state.upgrades;

    const attackBase = PLAYER_BASE_ATTACK * attackMultiplier(u.attack);
    const hpBase = PLAYER_BASE_HP * hpMultiplier(u.hp);
    const speedBase = attackSpeedValue(u.attackSpeed);

    const preFinalAttack = attackBase * (1 + c.atk) * (1 + s.attackRate);
    const finalAttackRate = Math.max(0, c.finalAtk);
    const attack = Math.max(1, floor(preFinalAttack * (1 + finalAttackRate)));
    const maxHp = Math.max(1, floor(hpBase * (1 + c.hp)));
    const attackSpeed = clamp(speedBase * (1 + c.speed) * (1 + s.attackSpeedRate), 1, 10);

    const critChance = clamp(critRatePercent(u.critRate) / 100 + c.crit + s.critChance, 0, 1);
    const critDamageBonus = clamp(critDamagePercent(u.critDamage) / 100 + c.critDmg + s.critDamage, 0.5, 10);
    const extraChance = clamp(extraHitRatePercent(u.extraHitRate) / 100 + c.cleave + s.extraHitRate, 0, 0.5);
    const extraCount = clamp(extraHitCountValue(u.extraHitCount), 0, 5);
    const lifestealChance = clamp(lifestealRatePercent(u.lifestealRate) / 100 + c.lifesteal, 0, 0.5);
    const lifestealAmount = clamp(lifestealAmountPercent(u.lifestealAmount) / 100 + s.lifestealAmount, 0, 0.2);

    const expectedDps = attack * attackSpeed * (1 + critChance * critDamageBonus) * (1 + extraChance * extraCount);
    const combatPower = floor(attack * 2.7 + maxHp * 0.26 + attackSpeed * 130 + critChance * 220 + critDamageBonus * 120 + extraChance * 180 + extraCount * 90 + lifestealChance * 120 + lifestealAmount * 350);

    return {
      attack,
      maxHp,
      attackSpeed,
      attackInterval: 1 / attackSpeed,
      critChance,
      critDamageBonus,
      extraChance,
      extraCount,
      lifestealChance,
      lifestealAmount,
      expectedDps,
      combatPower: Math.max(1, combatPower),
      defense: 0,
      damageReduction: clamp(s.damageReduction, 0, 0.7),
      goldGainMultiplier: (1 + c.gold) * (1 + s.goldGain) * (1 + coinShopGoldBoostRate),
      killRewardMultiplier: 1 + s.killReward,
      companionSlots: this.getUnlockedCompanionSlots(),
      skillSlots: this.getUnlockedSkillSlots()
    };
  }

  private familyForStage(stageIdx: number) { return ENEMY_FAMILIES[Math.max(0, stageIdx - 1) % ENEMY_FAMILIES.length]; }
  private stageIndex(): number { return stageOrdinal(this.state.chapter, this.state.stage); }

  private normalEnemyBaseStats(chapter = this.state.chapter, stage = this.state.stage): { atk: number; hp: number; stageIdx: number } {
    const stageIdx = stageOrdinal(chapter, stage);
    const atkMult = growthMultiplierByStage(stageIdx, ENEMY_ATK_GROWTH.early, ENEMY_ATK_GROWTH.mid, ENEMY_ATK_GROWTH.late);
    const hpMult = growthMultiplierByStage(stageIdx, ENEMY_HP_GROWTH.early, ENEMY_HP_GROWTH.mid, ENEMY_HP_GROWTH.late);
    return { stageIdx, atk: Math.max(1, floor(ENEMY_BASE_ATTACK * atkMult)), hp: Math.max(1, floor(ENEMY_BASE_HP * hpMult)) };
  }

  private normalGoldForStage(chapter = this.state.chapter, stage = this.state.stage): number {
    const idx = stageOrdinal(chapter, stage);
    const mult = growthMultiplierByStage(idx, GOLD_GROWTH.early, GOLD_GROWTH.mid, GOLD_GROWTH.late);
    return Math.max(1, floor(GOLD_BASE * mult));
  }

  private chapterClearGold(chapter: number): number {
    return Math.max(1, floor(this.normalGoldForStage(chapter, MAX_STAGE) * 20 * this.getDerivedStats().goldGainMultiplier));
  }

  private enemyGoldReward(type: EnemyType): number {
    let reward = this.normalGoldForStage();
    if (type === "midboss") reward *= MID_BOSS_MULTIPLIER.gold;
    if (type === "chapterBoss") reward *= CHAPTER_BOSS_GOLD_MULTIPLIER;
    const d = this.getDerivedStats();
    reward *= d.goldGainMultiplier;
    reward *= d.killRewardMultiplier;
    return Math.max(1, floor(reward));
  }

  private setEnemy(type: EnemyType, atk: number, hp: number, familyIndexSeed: number, interval: number): void {
    const family = this.familyForStage(familyIndexSeed);
    this.state.enemy = {
      type,
      name: type === "normal" ? family.normal : type === "midboss" ? family.midboss : family.chapterBoss,
      familyId: family.id,
      atk: Math.max(1, floor(atk)),
      hp: Math.max(1, floor(hp)),
      hpMax: Math.max(1, floor(hp)),
      attackInterval: Math.max(0.45, interval),
      spritePath: family.sprite[type]
    };
    this.state.enemySpawnSeq += 1;
    this.enemyAttackTimer = 0;
    this.state.bossTimeLeft = type === "normal" ? 0 : BOSS_TIME_LIMIT;
  }

  private spawnNormalEnemy(): void { const b = this.normalEnemyBaseStats(); this.setEnemy("normal", b.atk, b.hp, b.stageIdx, Math.max(0.58, 1.02 - b.stageIdx * 0.0005)); }
  private spawnMidBoss(): void { const b = this.normalEnemyBaseStats(); this.setEnemy("midboss", floor(b.atk * MID_BOSS_MULTIPLIER.atk), floor(b.hp * MID_BOSS_MULTIPLIER.hp), b.stageIdx, 0.6); }
  private spawnChapterBoss(): void { const b = this.normalEnemyBaseStats(); const m = chapterBossMultiplier(this.state.chapter); this.setEnemy("chapterBoss", floor(b.atk * m.atk), floor(b.hp * m.hp), b.stageIdx, 0.5); }

  private setNotice(text: string, kind: Notice["kind"] = "info", sec = 1.2): void { this.state.notice = { text, kind }; this.noticeRemain = sec; }
  private startTransition(text: string, kind: Notice["kind"], done: () => void): void { this.state.transitionSecLeft = 1; this.onTransitionDone = done; this.setNotice(text, kind, 1); this.heroAttackTimer = 0; this.enemyAttackTimer = 0; }
  private clearNoticeTick(dt: number): void { if (this.noticeRemain <= 0) return; this.noticeRemain -= dt; if (this.noticeRemain <= 0) this.state.notice = null; }

  private canTriggerSkill(def: CombatSkillDefinition, reason: "tick" | "on_kill" | "boss_start" | "lethal_damage"): boolean {
    if (!this.state.unlockedSkills.includes(def.id) || !this.state.equippedSkillIds.includes(def.id)) return false;
    const rt = this.ensureSkillRuntime(def.id);
    if (rt.active || rt.cooldownRemain > 0) return false;

    if (def.triggerType === "auto_interval") return reason === "tick";
    if (def.triggerType === "boss_start") return reason === "boss_start" || (reason === "tick" && !!def.allowAutoFallback);
    if (def.triggerType === "low_hp") return reason === "tick" && this.state.heroHp / Math.max(1, this.getDerivedStats().maxHp) <= (def.lowHpThreshold ?? 0.5);
    if (def.triggerType === "on_kill") return reason === "on_kill" || (reason === "tick" && !!def.allowAutoFallback);
    return reason === "lethal_damage";
  }

  private activateSkill(def: CombatSkillDefinition, reason: "tick" | "on_kill" | "boss_start" | "lethal_damage"): boolean {
    if (!this.canTriggerSkill(def, reason)) return false;
    const rt = this.ensureSkillRuntime(def.id);
    const values = skillValuesAtLevel(def, this.state.skillLevels[def.id] ?? 1);

    rt.cooldownRemain = def.cooldownSec;
    rt.active = def.durationSec > 0;
    rt.durationRemain = def.durationSec > 0 ? def.durationSec : 0;
    if (reason === "boss_start") rt.lastBossSpawnSeq = this.state.enemySpawnSeq;

    if (values.healMaxHpInstant > 0) this.state.heroHp = Math.min(this.getDerivedStats().maxHp, this.state.heroHp + Math.max(1, floor(this.getDerivedStats().maxHp * values.healMaxHpInstant)));
    if (reason === "lethal_damage" && values.lethalHealMaxHp > 0) this.state.heroHp = Math.max(1, floor(this.getDerivedStats().maxHp * values.lethalHealMaxHp));

    this.setNotice(`스킬 발동: ${def.name}`, "success", 0.9);
    return true;
  }

  private updateSkillTimers(dt: number): void {
    this.normalizeSkillState();
    for (const id of this.state.equippedSkillIds) {
      const rt = this.ensureSkillRuntime(id);
      if (rt.cooldownRemain > 0) rt.cooldownRemain = Math.max(0, rt.cooldownRemain - dt);
      if (rt.active) {
        rt.durationRemain = Math.max(0, rt.durationRemain - dt);
        if (rt.durationRemain <= 0) rt.active = false;
      }
    }
  }

  private tryAutoTriggerSkills(): void {
    this.normalizeSkillState();
    for (const id of this.state.equippedSkillIds) {
      const def = getCombatSkillById(id);
      if (!def) continue;
      if (def.triggerType === "boss_start") {
        const rt = this.ensureSkillRuntime(def.id);
        if (this.state.enemy.type !== "normal" && rt.lastBossSpawnSeq !== this.state.enemySpawnSeq) {
          if (this.activateSkill(def, "boss_start")) continue;
        }
      }
      this.activateSkill(def, "tick");
    }
  }

  private tryOnKillTriggerSkills(): void {
    this.normalizeSkillState();
    for (const id of this.state.equippedSkillIds) {
      const def = getCombatSkillById(id);
      if (!def || def.triggerType !== "on_kill") continue;
      this.activateSkill(def, "on_kill");
    }
  }

  private tryLethalTriggerSkill(): boolean {
    const list = this.state.equippedSkillIds.map((id) => getCombatSkillById(id)).filter((v): v is CombatSkillDefinition => !!v && v.triggerType === "lethal_damage");
    for (const def of list) if (this.activateSkill(def, "lethal_damage")) return true;
    return false;
  }

  tick(dt: number): void {
    const safeDt = Math.max(0, Math.min(0.1, dt));
    this.clearNoticeTick(safeDt);

    if (this.state.transitionSecLeft > 0) {
      this.state.transitionSecLeft = Math.max(0, this.state.transitionSecLeft - safeDt);
      if (this.state.transitionSecLeft <= 0 && this.onTransitionDone) {
        const done = this.onTransitionDone;
        this.onTransitionDone = null;
        done();
      }
      return;
    }

    this.updateSkillTimers(safeDt);
    this.tryAutoTriggerSkills();

    const derived = this.getDerivedStats();

    this.heroAttackTimer += safeDt;
    while (this.heroAttackTimer >= derived.attackInterval) {
      this.heroAttackTimer -= derived.attackInterval;
      this.heroStrike(derived);
      if (this.state.transitionSecLeft > 0) return;
    }

    this.enemyAttackTimer += safeDt;
    while (this.enemyAttackTimer >= this.state.enemy.attackInterval) {
      this.enemyAttackTimer -= this.state.enemy.attackInterval;
      this.enemyStrike(derived);
      if (this.state.transitionSecLeft > 0) return;
    }

    if (this.state.enemy.type !== "normal" && this.state.enemy.hp > 0) {
      this.state.bossTimeLeft -= safeDt;
      if (this.state.bossTimeLeft <= 0) this.resetCurrentStage("보스 제한시간 초과로 스테이지가 초기화됩니다");
    }
  }

  private heroStrike(derived: DerivedStats): void {
    if (this.state.enemy.hp <= 0 || this.state.heroHp <= 0) return;

    const crit = Math.random() < derived.critChance;
    const extraTrigger = derived.extraCount > 0 && Math.random() < derived.extraChance;
    const hitCount = 1 + (extraTrigger ? derived.extraCount : 0);

    for (let i = 0; i < hitCount; i += 1) {
      const damage = randomizeDamage(crit ? derived.attack * (1 + derived.critDamageBonus) : derived.attack);
      this.state.enemy.hp = Math.max(0, this.state.enemy.hp - damage);
      if (this.state.enemy.hp <= 0) break;
    }

    if (Math.random() < derived.lifestealChance) {
      const vsBoss = this.state.enemy.type !== "normal";
      const lifestealAmount = derived.lifestealAmount * (vsBoss ? (1 - BOSS_LIFESTEAL_PENALTY) : 1);
      const rawHeal = floor(derived.maxHp * Math.max(0, lifestealAmount));
      if (rawHeal > 0) {
        const secBucket = Math.floor(this.nowMs() / 1000);
        if (this.lifestealSecondBucket !== secBucket) {
          this.lifestealSecondBucket = secBucket;
          this.lifestealHealedInBucket = 0;
        }
        const capPerSec = Math.max(1, floor(derived.maxHp * LIFESTEAL_CAP_PER_SECOND));
        const remain = Math.max(0, capPerSec - this.lifestealHealedInBucket);
        const heal = Math.min(rawHeal, remain);
        if (heal > 0) {
          this.lifestealHealedInBucket += heal;
          this.state.heroHp = clamp(this.state.heroHp + heal, 0, derived.maxHp);
        }
      }
    }

    if (this.state.enemy.hp <= 0) this.onEnemyDefeated();
  }

  private enemyStrike(derived: DerivedStats): void {
    if (this.state.enemy.hp <= 0 || this.state.heroHp <= 0) return;
    const damage = randomizeDamage(Math.max(1, this.state.enemy.atk * (1 - derived.damageReduction) - derived.defense));

    if (damage >= this.state.heroHp) {
      if (this.tryLethalTriggerSkill()) return;
      this.state.heroHp = 0;
      this.resetCurrentStage("플레이어 사망으로 스테이지가 초기화됩니다");
      return;
    }

    this.state.heroHp = Math.max(0, this.state.heroHp - damage);
  }

  private onEnemyDefeated(): void {
    const defeatedType = this.state.enemy.type;
    this.state.gold += this.enemyGoldReward(defeatedType);
    if (Math.random() < DIAMOND_DROP_CHANCE) this.state.diamonds += 1;

    this.tryOnKillTriggerSkills();

    this.gainExp(Math.max(6, floor(6 + this.stageIndex() * 0.8)));

    const label = defeatedType === "midboss" ? "중간보스 처치" : defeatedType === "chapterBoss" ? "챕터보스 처치" : "적 처치";
    this.startTransition(label, "success", () => this.advanceAfterKill(defeatedType));
  }

  private gainExp(exp: number): void {
    this.state.exp += Math.max(0, floor(exp));
    while (this.state.exp >= expNeed(this.state.level)) {
      this.state.exp -= expNeed(this.state.level);
      this.state.level += 1;
      this.state.heroHp = Math.min(this.getDerivedStats().maxHp, this.state.heroHp + 8);
      this.setNotice("레벨 업!", "success", 1.1);
    }
  }

  private healAfterBossClear(): void { this.state.heroHp = this.getDerivedStats().maxHp; }

  private advanceAfterKill(type: EnemyType): void {
    if (type === "normal") {
      this.state.stageKillCount += 1;
      if (this.state.stageKillCount >= ENEMIES_PER_STAGE) { this.state.stageKillCount = ENEMIES_PER_STAGE; this.spawnMidBoss(); } else this.spawnNormalEnemy();
      return;
    }

    if (type === "midboss") {
      this.state.stageKillCount = 0;
      if (this.state.stage >= MAX_STAGE) this.spawnChapterBoss();
      else { this.state.stage = clamp(this.state.stage + 1, 1, MAX_STAGE); this.spawnNormalEnemy(); }
      this.healAfterBossClear();
      this.setNotice("스테이지 클리어 - 체력 회복", "success", 1.2);
      return;
    }

    const clearedChapter = this.state.chapter;
    this.state.gold += this.chapterClearGold(clearedChapter);
    this.state.diamonds += CHAPTER_CLEAR_DIAMOND_REWARD;

    if (this.state.chapter < MAX_CHAPTER) { this.state.chapter += 1; this.state.stage = 1; } else { this.state.chapter = MAX_CHAPTER; this.state.stage = MAX_STAGE; }
    this.state.stageKillCount = 0;

    if (!this.state.freeSkillChapter2Granted && clearedChapter === 2) {
      const pool = COMBAT_SKILLS.filter((s) => (s.rarity === "common" || s.rarity === "rare") && !this.state.unlockedSkills.includes(s.id));
      if (pool.length > 0) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        this.state.unlockedSkills.push(pick.id);
        this.state.skillLevels[pick.id] = 1;
        this.setNotice(`무료 스킬 지급: ${pick.name}`, "success", 1.4);
      }
      this.state.freeSkillChapter2Granted = true;
    }

    this.normalizeSkillState();
    this.spawnNormalEnemy();
    this.healAfterBossClear();
    this.setNotice("챕터 클리어 - 체력 회복", "success", 1.5);
  }

  private resetCurrentStage(text: string): void {
    this.startTransition(text, "danger", () => {
      this.state.stageKillCount = 0;
      this.state.heroHp = this.getDerivedStats().maxHp;
      this.spawnNormalEnemy();
    });
  }

  getStageLabel(): string { return `${this.state.chapter}-${this.state.stage}`; }
  getStageProgressRate(): number { return clamp(this.state.stageKillCount / ENEMIES_PER_STAGE, 0, 1); }

  getCompanionStatBreakdown() {
    const u = this.state.upgrades;
    const baseAttack = Math.max(1, floor(PLAYER_BASE_ATTACK * attackMultiplier(u.attack)));
    const baseHp = Math.max(1, floor(PLAYER_BASE_HP * hpMultiplier(u.hp)));
    const baseSpeed = attackSpeedValue(u.attackSpeed);
    const baseCritRate = critRatePercent(u.critRate) / 100;
    const baseCritDamage = critDamagePercent(u.critDamage) / 100;
    const baseExtraRate = extraHitRatePercent(u.extraHitRate) / 100;
    const baseExtraCount = extraHitCountValue(u.extraHitCount);
    const baseLifeRate = lifestealRatePercent(u.lifestealRate) / 100;
    const baseLifeAmount = lifestealAmountPercent(u.lifestealAmount) / 100;

    const t = this.getDerivedStats();

    return {
      attack: { base: baseAttack, bonus: Math.max(0, t.attack - baseAttack), total: t.attack },
      hp: { base: baseHp, bonus: Math.max(0, t.maxHp - baseHp), total: t.maxHp },
      speed: { base: baseSpeed, bonus: Math.max(0, t.attackSpeed - baseSpeed), total: t.attackSpeed },
      critChance: { base: baseCritRate, bonus: Math.max(0, t.critChance - baseCritRate), total: t.critChance },
      critDamage: { base: baseCritDamage, bonus: Math.max(0, t.critDamageBonus - baseCritDamage), total: t.critDamageBonus },
      extraChance: { base: baseExtraRate, bonus: Math.max(0, t.extraChance - baseExtraRate), total: t.extraChance },
      extraCount: { base: baseExtraCount, bonus: Math.max(0, t.extraCount - baseExtraCount), total: t.extraCount },
      lifestealChance: { base: baseLifeRate, bonus: Math.max(0, t.lifestealChance - baseLifeRate), total: t.lifestealChance },
      lifestealAmount: { base: baseLifeAmount, bonus: Math.max(0, t.lifestealAmount - baseLifeAmount), total: t.lifestealAmount }
    };
  }

  getUpgradeDisplay(batch: number): UpgradeDisplayInfo[] {
    const ask = Math.max(1, floor(batch));

    return UPGRADE_ORDER.map((key) => {
      const level = this.state.upgrades[key];
      const count = upgradeUpgradableCount(key, level, ask);
      const done = count <= 0;
      const cost = done ? 0 : sumSequentialCost(count, (i) => upgradeCostAtLevel(key, level + i));
      const currentValue = upgradeCurrentNumericValue(key, level);
      const nextValue = done ? currentValue : upgradeCurrentNumericValue(key, level + count);

      const unit = key === "attackSpeed" ? "회/초" : key === "extraHitCount" ? "회" : "%";
      const fixed = key === "attackSpeed" ? 3 : 2;
      const fmt = (v: number) => v.toFixed(fixed).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");

      return {
        key,
        label: UPGRADE_RULES[key].label,
        level,
        currentText: `${fmt(currentValue)}${unit}`,
        nextText: `${fmt(nextValue)}${unit}`,
        cost,
        count,
        done
      };
    });
  }

  upgradeStat(key: UpgradeKey, batch = 1): ActionFeedback {
    const ask = Math.max(1, floor(batch));
    const cur = this.state.upgrades[key];
    const count = upgradeUpgradableCount(key, cur, ask);
    if (count <= 0) return { ok: false, message: "강화 완료" };

    const cost = sumSequentialCost(count, (i) => upgradeCostAtLevel(key, cur + i));
    if (this.state.gold < cost) return { ok: false, message: "골드가 부족합니다" };

    this.state.gold -= cost;

    if (key === "hp") {
      for (let i = 0; i < count; i += 1) {
        const before = this.getDerivedStats().maxHp;
        this.state.upgrades.hp += 1;
        const after = this.getDerivedStats().maxHp;
        this.state.heroHp = Math.min(after, this.state.heroHp + (after - before));
      }
    } else {
      this.state.upgrades[key] += count;
    }

    return { ok: true, message: `${UPGRADE_RULES[key].label} ${count}회 강화` };
  }

  getCombatSkillsDisplay(): SkillDisplayInfo[] {
    this.normalizeSkillState();
    const rarityRank: Record<"common" | "rare" | "epic" | "legendary", number> = {
      common: 1,
      rare: 2,
      epic: 3,
      legendary: 4
    };
    const sortedSkills = COMBAT_SKILLS.slice().sort((a, b) => {
      const rankDiff = rarityRank[a.rarity] - rarityRank[b.rarity];
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name, "ko-KR");
    });

    return sortedSkills.map((def) => {
      const unlocked = this.state.unlockedSkills.includes(def.id);
      const level = unlocked ? this.state.skillLevels[def.id] ?? 1 : 0;
      const equipped = this.state.equippedSkillIds.includes(def.id);
      return {
        id: def.id,
        name: def.name,
        rarity: def.rarity,
        type: def.type,
        description: def.description,
        triggerType: def.triggerType,
        level,
        maxLevel: def.maxLevel,
        unlocked,
        equipped,
        unlockCost: unlocked ? 0 : skillUnlockCost(def),
        upgradeCost: unlocked && level < def.maxLevel ? skillUpgradeCost(def, level) : 0,
        cooldownSec: def.cooldownSec,
        durationSec: def.durationSec
      };
    });
  }

  unlockCombatSkill(id: string): ActionFeedback {
    const def = getCombatSkillById(id);
    if (!def) return { ok: false, message: "존재하지 않는 스킬입니다" };
    this.normalizeSkillState();
    if (this.state.unlockedSkills.includes(id)) return { ok: false, message: "이미 해금된 스킬입니다" };
    const cost = skillUnlockCost(def);
    if (this.state.diamonds < cost) return { ok: false, message: "다이아가 부족합니다" };
    this.state.diamonds -= cost;
    this.state.unlockedSkills.push(id);
    this.state.skillLevels[id] = 1;
    this.normalizeSkillState();
    return { ok: true, message: `${def.name} 해금` };
  }

  upgradeCombatSkill(id: string): ActionFeedback {
    const def = getCombatSkillById(id);
    if (!def) return { ok: false, message: "존재하지 않는 스킬입니다" };
    this.normalizeSkillState();
    if (!this.state.unlockedSkills.includes(id)) return { ok: false, message: "해금되지 않은 스킬입니다" };
    const level = this.state.skillLevels[id] ?? 1;
    if (level >= def.maxLevel) return { ok: false, message: "강화 완료" };
    const cost = skillUpgradeCost(def, level);
    if (this.state.diamonds < cost) return { ok: false, message: "다이아가 부족합니다" };
    this.state.diamonds -= cost;
    this.state.skillLevels[id] = level + 1;
    this.normalizeSkillState();
    return { ok: true, message: `${def.name} Lv${level + 1} 강화` };
  }

  toggleEquipCombatSkill(id: string): ActionFeedback {
    const def = getCombatSkillById(id);
    if (!def) return { ok: false, message: "존재하지 않는 스킬입니다" };
    this.normalizeSkillState();
    if (!this.state.unlockedSkills.includes(id)) return { ok: false, message: "해금되지 않은 스킬입니다" };

    const idx = this.state.equippedSkillIds.indexOf(id);
    if (idx >= 0) {
      this.state.equippedSkillIds.splice(idx, 1);
      this.normalizeSkillState();
      return { ok: true, message: `${def.name} 장착 해제` };
    }

    if (this.state.equippedSkillIds.length >= this.state.skillSlotsUnlocked) {
      return { ok: false, message: `스킬 슬롯이 부족합니다 (${this.state.skillSlotsUnlocked}개)` };
    }

    this.state.equippedSkillIds.push(id);
    this.normalizeSkillState();
    return { ok: true, message: `${def.name} 장착` };
  }

  clearEquippedSkills(): ActionFeedback {
    this.state.equippedSkillIds = [];
    this.normalizeSkillState();
    return { ok: true, message: "스킬 전체 해제" };
  }

  drawCompanions(drawCount: 1 | 11): ActionFeedback {
    const cost = drawCount === 11 ? COMPANION_DRAW_COST.multi11 : COMPANION_DRAW_COST.single;
    if (this.state.diamonds < cost) return { ok: false, message: "다이아가 부족합니다" };

    this.state.diamonds -= cost;
    this.state.drawCount += drawCount;

    const draws: DrawResult[] = [];
    for (let i = 0; i < drawCount; i += 1) {
      const tier = pickTierByRate();
      const pool = COMPANIONS.filter((v) => v.tier === tier);
      const pick = pool[Math.floor(Math.random() * pool.length)] ?? COMPANIONS[0];
      const rt = this.getCompanionRuntime(pick.id);
      const isNew = rt.level <= 0;
      let coinGain = 0;

      if (isNew) {
        this.state.companionRuntime[pick.id] = { level: 1, shards: rt.shards };
      } else {
        const dup = this.grantDuplicateCompanionReward(pick.id);
        coinGain = dup.coinGain;
      }

      const after = this.getCompanionRuntime(pick.id);
      draws.push({ id: pick.id, name: pick.name, tier: pick.tier, isNew, level: after.level, shards: after.shards, coinGain });
    }

    this.normalizeCompanionState();
    return { ok: true, message: drawCount === 11 ? "11연 동료 뽑기 완료" : "동료 뽑기 완료", draws };
  }

  toggleEquipCompanion(id: string): ActionFeedback {
    const def = companionById.get(id);
    if (!def) return { ok: false, message: "존재하지 않는 동료입니다" };
    if (!this.isCompanionOwned(id)) return { ok: false, message: "미보유 동료입니다" };

    const idx = this.state.equippedCompanionIds.indexOf(id);
    if (idx >= 0) {
      this.state.equippedCompanionIds.splice(idx, 1);
      this.normalizeCompanionState();
      return { ok: true, message: `${def.name} 장착 해제` };
    }

    if (this.state.equippedCompanionIds.length >= this.getUnlockedCompanionSlots()) {
      return { ok: false, message: `장착 슬롯이 부족합니다 (${this.getUnlockedCompanionSlots()}개)` };
    }

    this.state.equippedCompanionIds.push(id);
    this.normalizeCompanionState();
    return { ok: true, message: `${def.name} 장착` };
  }

  clearEquippedCompanions(): ActionFeedback {
    this.state.equippedCompanionIds = [];
    this.normalizeCompanionState();
    return { ok: true, message: "동료 전체 해제" };
  }

  companionLevelUpCost(id: string): number {
    const def = companionById.get(id);
    if (!def) return 0;
    const rt = this.getCompanionRuntime(id);
    if (rt.level <= 0 || rt.level >= COMPANION_MAX_LEVEL) return 0;
    return Math.max(1, floor(COMPANION_LEVELUP_COST_START[def.tier] * Math.pow(COMPANION_LEVELUP_COST_GROWTH[def.tier], rt.level - 1)));
  }

  levelUpCompanion(id: string): ActionFeedback {
    const def = companionById.get(id);
    if (!def) return { ok: false, message: "존재하지 않는 동료입니다" };
    const rt = this.getCompanionRuntime(id);
    if (rt.level <= 0) return { ok: false, message: "미보유 동료입니다" };
    if (rt.level >= COMPANION_MAX_LEVEL) return { ok: false, message: "이미 최대 레벨입니다" };

    const cost = this.companionLevelUpCost(id);
    const needShard = this.fragmentNeedForLevel(rt.level);
    const hasTicket = this.state.companionGrowthTickets > 0;
    if (!hasTicket && rt.shards < needShard) return { ok: false, message: `동료 조각이 부족합니다 (${rt.shards}/${needShard})` };
    if (this.state.diamonds < cost) return { ok: false, message: "다이아가 부족합니다" };

    this.state.diamonds -= cost;
    const nextShards = hasTicket ? rt.shards : Math.max(0, rt.shards - needShard);
    if (hasTicket) this.state.companionGrowthTickets = Math.max(0, this.state.companionGrowthTickets - 1);
    this.state.companionRuntime[id] = { level: rt.level + 1, shards: nextShards };
    return { ok: true, message: `${def.name} Lv${rt.level + 1} 강화` };
  }

  getCompanionEffectSummaryText(): string { return this.getCompanionEffectSummarySplitText().total; }

  serialize(): PersistedGameData {
    this.normalizeCompanionState();
    this.resetShopPurchaseHistoryIfNeeded();
    this.normalizeSkillState();

    const companionLevels: Record<string, number> = {};
    for (const [id, rt] of Object.entries(this.state.companionRuntime)) companionLevels[id] = rt.level;

    return {
      version: SAVE_VERSION,
      gold: Math.max(0, floor(this.state.gold)),
      diamonds: Math.max(0, floor(this.state.diamonds)),
      chapter: clamp(floor(this.state.chapter), 1, MAX_CHAPTER),
      currentStage: clamp(floor(this.state.stage), 1, MAX_STAGE),
      stageKillCount: clamp(floor(this.state.stageKillCount), 0, ENEMIES_PER_STAGE),
      level: Math.max(1, floor(this.state.level)),
      exp: Math.max(0, floor(this.state.exp)),
      heroHp: Math.max(0, floor(this.state.heroHp)),
      drawCount: Math.max(0, floor(this.state.drawCount)),
      attackUpgradeLevel: this.state.upgrades.attack,
      hpUpgradeLevel: this.state.upgrades.hp,
      attackSpeedUpgradeLevel: this.state.upgrades.attackSpeed,
      critRateUpgradeLevel: this.state.upgrades.critRate,
      critDamageUpgradeLevel: this.state.upgrades.critDamage,
      extraHitRateUpgradeLevel: this.state.upgrades.extraHitRate,
      extraHitCountUpgradeLevel: this.state.upgrades.extraHitCount,
      lifestealRateUpgradeLevel: this.state.upgrades.lifestealRate,
      lifestealAmountUpgradeLevel: this.state.upgrades.lifestealAmount,
      skillSlotsUnlocked: this.state.skillSlotsUnlocked,
      equippedSkillIds: [...this.state.equippedSkillIds],
      unlockedSkills: [...this.state.unlockedSkills],
      skillLevels: { ...this.state.skillLevels },
      companions: { ...this.state.companionRuntime },
      equippedCompanions: [...this.state.equippedCompanionIds],
      companionLevels,
      companionCoins: this.getCompanionCoins(),
      companionGrowthTickets: this.getCompanionGrowthTickets(),
      shopPurchaseHistory: { ...this.state.shopPurchaseHistory },
      enemyGrowthSettings: { atk: { ...ENEMY_ATK_GROWTH }, hp: { ...ENEMY_HP_GROWTH } },
      bossGrowthSettings: {
        midboss: { atk: MID_BOSS_MULTIPLIER.atk, hp: MID_BOSS_MULTIPLIER.hp },
        chapterBoss: { early: chapterBossMultiplier(1), mid: chapterBossMultiplier(5), late: chapterBossMultiplier(11) }
      },
      lifestealCapPerSecond: LIFESTEAL_CAP_PER_SECOND,
      bossLifestealPenalty: BOSS_LIFESTEAL_PENALTY,
      finalAttackPercentFromCompanions: companionTotals.finalAtk,
      activeCoinShopGoldBoost: this.state.activeCoinShopGoldBoost ? { ...this.state.activeCoinShopGoldBoost } : null,
      freeSkillChapter2Granted: this.state.freeSkillChapter2Granted
    };
  }

  load(data: PersistedGameData): void {
    if (!data || typeof data !== "object") return;

    this.state.gold = Math.max(0, floor(data.gold ?? 0));
    this.state.diamonds = Math.max(0, floor(data.diamonds ?? 0));
    this.state.chapter = clamp(floor(data.chapter ?? 1), 1, MAX_CHAPTER);
    this.state.stage = clamp(floor((data.currentStage ?? data.stage) ?? 1), 1, MAX_STAGE);
    this.state.stageKillCount = clamp(floor(data.stageKillCount ?? 0), 0, ENEMIES_PER_STAGE);
    this.state.level = Math.max(1, floor(data.level ?? 1));
    this.state.exp = Math.max(0, floor(data.exp ?? 0));
    this.state.drawCount = Math.max(0, floor(data.drawCount ?? 0));

    const legacyUp = data.upgrades ?? {};
    const legacySk = data.skills ?? {};

    const normalizeLevel = (key: UpgradeKey, value: number): number => {
      const max = UPGRADE_RULES[key].maxLevel;
      const lv = Math.max(0, floor(value));
      return max === null ? lv : clamp(lv, 0, max);
    };

    this.state.upgrades = {
      attack: normalizeLevel("attack", data.attackUpgradeLevel ?? legacyUp.attack ?? 0),
      hp: normalizeLevel("hp", data.hpUpgradeLevel ?? legacyUp.hp ?? 0),
      attackSpeed: normalizeLevel("attackSpeed", data.attackSpeedUpgradeLevel ?? Math.round((legacyUp.speed ?? 0) * 1.6)),
      critRate: normalizeLevel("critRate", data.critRateUpgradeLevel ?? Math.round((legacySk.critChance ?? 0) * 2)),
      critDamage: normalizeLevel("critDamage", data.critDamageUpgradeLevel ?? Math.round((legacySk.critDamage ?? 0) * 1.5)),
      extraHitRate: normalizeLevel("extraHitRate", data.extraHitRateUpgradeLevel ?? Math.round((legacySk.extraChance ?? 0) * 2)),
      extraHitCount: normalizeLevel("extraHitCount", data.extraHitCountUpgradeLevel ?? Math.round((legacySk.extraCount ?? 0) * 2)),
      lifestealRate: normalizeLevel("lifestealRate", data.lifestealRateUpgradeLevel ?? Math.round((legacySk.lifestealChance ?? 0) * 2)),
      lifestealAmount: normalizeLevel("lifestealAmount", data.lifestealAmountUpgradeLevel ?? Math.round((legacySk.lifestealAmount ?? 0) * (5 / 3)))
    } as UpgradeLevels;

    this.state.unlockedSkills = Array.isArray(data.unlockedSkills) ? [...data.unlockedSkills] : [];
    this.state.skillLevels = typeof data.skillLevels === "object" && data.skillLevels ? { ...data.skillLevels } : {};
    this.state.equippedSkillIds = Array.isArray(data.equippedSkillIds) ? [...data.equippedSkillIds] : [];
    this.state.skillSlotsUnlocked = Math.max(1, floor(data.skillSlotsUnlocked ?? this.getUnlockedSkillSlots()));
    this.state.skillRuntime = {};

    const rawCompanionRuntime = (data.companions ?? data.companionRuntime ?? {}) as Record<string, unknown>;
    const rawCompanionLevels = (typeof data.companionLevels === "object" && data.companionLevels ? data.companionLevels : {}) as Record<string, unknown>;
    const companionRuntime: Record<string, CompanionRuntime> = {};

    for (const [id, raw] of Object.entries(rawCompanionRuntime)) {
      if (typeof raw === "number") {
        companionRuntime[id] = { level: Math.max(0, floor(raw)), shards: 0 };
      } else if (raw && typeof raw === "object") {
        const v = raw as Partial<CompanionRuntime>;
        companionRuntime[id] = {
          level: Math.max(0, floor(Number(v.level ?? 0))),
          shards: Math.max(0, floor(Number(v.shards ?? 0)))
        };
      }
    }

    for (const [id, lvRaw] of Object.entries(rawCompanionLevels)) {
      const lv = Math.max(0, floor(Number(lvRaw ?? 0)));
      if (!companionRuntime[id]) companionRuntime[id] = { level: lv, shards: 0 };
      else companionRuntime[id].level = Math.max(companionRuntime[id].level, lv);
    }

    this.state.companionRuntime = companionRuntime;
    this.state.companionCoins = Math.max(0, floor(data.companionCoins ?? 0));
    this.state.companionGrowthTickets = Math.max(0, floor(data.companionGrowthTickets ?? 0));
    this.state.shopPurchaseHistory = typeof data.shopPurchaseHistory === "object" && data.shopPurchaseHistory ? { ...data.shopPurchaseHistory } : {};
    this.state.activeCoinShopGoldBoost = data.activeCoinShopGoldBoost && typeof data.activeCoinShopGoldBoost === "object"
      ? { rate: Math.max(0, Number(data.activeCoinShopGoldBoost.rate ?? 0)), endAt: Math.max(0, floor(Number(data.activeCoinShopGoldBoost.endAt ?? 0))) }
      : null;
    this.state.equippedCompanionIds = Array.isArray(data.equippedCompanions)
      ? [...data.equippedCompanions]
      : Array.isArray(data.equippedCompanionIds)
        ? [...data.equippedCompanionIds]
        : [];

    this.state.freeSkillChapter2Granted = !!data.freeSkillChapter2Granted;

    this.normalizeCompanionState();
    this.resetShopPurchaseHistoryIfNeeded();
    this.normalizeSkillState();
    this.grantInitialFreeSkillIfNeeded();

    this.state.heroHp = Math.max(0, floor(data.heroHp ?? this.getDerivedStats().maxHp));
    this.state.heroHp = Math.min(this.state.heroHp, this.getDerivedStats().maxHp);

    if (this.state.stageKillCount >= ENEMIES_PER_STAGE) this.spawnMidBoss();
    else this.spawnNormalEnemy();

    this.state.notice = null;
    this.state.transitionSecLeft = 0;
    this.bossTimeLeftEnsure();
  }

  private bossTimeLeftEnsure(): void {
    if (this.state.enemy.type === "normal") { this.state.bossTimeLeft = 0; return; }
    this.state.bossTimeLeft = clamp(this.state.bossTimeLeft || BOSS_TIME_LIMIT, 0, BOSS_TIME_LIMIT);
  }
}






































