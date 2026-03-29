export type EnemyType = "normal" | "midboss" | "chapterBoss";
export type CompanionRole = "atk" | "hp" | "speed" | "crit" | "util";
export type CompanionTier = 1 | 2 | 3 | 4;
export type ShopLimitType = "daily" | "weekly";
export type ShopRewardType = "tier_fragment_selector" | "tier_fragment_random" | "gold_boost_small" | "gold_boost_medium" | "companion_growth_ticket";

export type UpgradeKey =
  | "attack"
  | "hp"
  | "attackSpeed"
  | "critRate"
  | "critDamage"
  | "extraHitRate"
  | "extraHitCount"
  | "lifestealRate"
  | "lifestealAmount";

export type CombatSkillType = "attack" | "crit" | "survival" | "utility" | "hybrid";
export type CombatSkillRarity = "common" | "rare" | "epic" | "legendary";
export type SkillTriggerType = "auto_interval" | "boss_start" | "low_hp" | "on_kill" | "lethal_damage";

export interface CompanionEffect {
  atk?: number;
  finalAtk?: number;
  hp?: number;
  speed?: number;
  crit?: number;
  critDmg?: number;
  cleave?: number;
  lifesteal?: number;
  gold?: number;
}

export interface CompanionDefinition {
  id: string;
  name: string;
  tier: CompanionTier;
  role: CompanionRole;
  baseOwnedEffects: CompanionEffect;
  baseEquippedEffects: CompanionEffect;
  ownedGrowthRate: number;
  equippedGrowthRate: number;
}

export interface CoinShopGoldBoostState {
  rate: number;
  endAt: number;
}

export interface CompanionRuntime {
  level: number;
  shards: number;
}

export interface UpgradeLevels {
  attack: number;
  hp: number;
  attackSpeed: number;
  critRate: number;
  critDamage: number;
  extraHitRate: number;
  extraHitCount: number;
  lifestealRate: number;
  lifestealAmount: number;
}

export interface SkillStatValues {
  attackRate?: number;
  attackSpeedRate?: number;
  critChance?: number;
  critDamage?: number;
  extraHitRate?: number;
  lifestealAmount?: number;
  damageReduction?: number;
  healMaxHpInstant?: number;
  lethalHealMaxHp?: number;
  goldGain?: number;
  killReward?: number;
}

export interface CombatSkillDefinition {
  id: string;
  name: string;
  type: CombatSkillType;
  rarity: CombatSkillRarity;
  description: string;
  maxLevel: number;
  cooldownSec: number;
  durationSec: number;
  triggerType: SkillTriggerType;
  lowHpThreshold?: number;
  allowAutoFallback?: boolean;
  baseValues: SkillStatValues;
  scalingPerLevel: SkillStatValues;
}

export interface SkillRuntimeState {
  cooldownRemain: number;
  durationRemain: number;
  active: boolean;
  lastBossSpawnSeq: number;
}

export interface EnemyState {
  type: EnemyType;
  name: string;
  familyId: string;
  atk: number;
  hp: number;
  hpMax: number;
  attackInterval: number;
  spritePath: string;
}

export interface Notice {
  text: string;
  kind: "info" | "success" | "danger";
}

export interface PersistedGameData {
  version: number;
  gold: number;
  diamonds: number;
  chapter: number;
  currentStage: number;
  stageKillCount: number;
  level: number;
  exp: number;
  heroHp: number;
  drawCount: number;

  attackUpgradeLevel: number;
  hpUpgradeLevel: number;
  attackSpeedUpgradeLevel: number;
  critRateUpgradeLevel: number;
  critDamageUpgradeLevel: number;
  extraHitRateUpgradeLevel: number;
  extraHitCountUpgradeLevel: number;
  lifestealRateUpgradeLevel: number;
  lifestealAmountUpgradeLevel: number;

  skillSlotsUnlocked: number;
  equippedSkillIds: string[];
  unlockedSkills: string[];
  skillLevels: Record<string, number>;

  companions: Record<string, CompanionRuntime>;
  equippedCompanions: string[];
  companionLevels: Record<string, number>;

  companionCoins: number;
  companionGrowthTickets: number;
  shopPurchaseHistory: Record<string, ShopPurchaseHistoryEntry>;
  enemyGrowthSettings?: { atk: { early: number; mid: number; late: number }; hp: { early: number; mid: number; late: number } };
  bossGrowthSettings?: { midboss: { atk: number; hp: number }; chapterBoss: { early: { atk: number; hp: number }; mid: { atk: number; hp: number }; late: { atk: number; hp: number } } };
  lifestealCapPerSecond?: number;
  bossLifestealPenalty?: number;
  finalAttackPercentFromCompanions?: number;
  activeCoinShopGoldBoost: CoinShopGoldBoostState | null;

  freeSkillChapter2Granted: boolean;

  upgrades?: Partial<Record<"attack" | "hp" | "speed", number>>;
  skills?: Partial<Record<"critChance" | "critDamage" | "extraChance" | "extraCount" | "lifestealChance" | "lifestealAmount", number>>;
  stage?: number;
  equippedCompanionIds?: string[];
  companionRuntime?: Record<string, CompanionRuntime>;
}

export interface GameState {
  gold: number;
  diamonds: number;
  chapter: number;
  stage: number;
  stageKillCount: number;
  level: number;
  exp: number;
  heroHp: number;
  bossTimeLeft: number;
  drawCount: number;

  upgrades: UpgradeLevels;

  skillSlotsUnlocked: number;
  equippedSkillIds: string[];
  unlockedSkills: string[];
  skillLevels: Record<string, number>;
  skillRuntime: Record<string, SkillRuntimeState>;

  equippedCompanionIds: string[];
  companionRuntime: Record<string, CompanionRuntime>;
  companionCoins: number;
  companionGrowthTickets: number;
  shopPurchaseHistory: Record<string, ShopPurchaseHistoryEntry>;
  enemyGrowthSettings?: { atk: { early: number; mid: number; late: number }; hp: { early: number; mid: number; late: number } };
  bossGrowthSettings?: { midboss: { atk: number; hp: number }; chapterBoss: { early: { atk: number; hp: number }; mid: { atk: number; hp: number }; late: { atk: number; hp: number } } };
  lifestealCapPerSecond?: number;
  bossLifestealPenalty?: number;
  finalAttackPercentFromCompanions?: number;
  activeCoinShopGoldBoost: CoinShopGoldBoostState | null;

  freeSkillChapter2Granted: boolean;

  enemy: EnemyState;
  notice: Notice | null;
  transitionSecLeft: number;
  enemySpawnSeq: number;
}

export interface ActiveSkillBuffView {
  id: string;
  name: string;
  remainSec: number;
  summary: string;
}

export interface DerivedStats {
  attack: number;
  maxHp: number;
  attackSpeed: number;
  attackInterval: number;
  critChance: number;
  critDamageBonus: number;
  extraChance: number;
  extraCount: number;
  lifestealChance: number;
  lifestealAmount: number;
  expectedDps: number;
  combatPower: number;
  defense: number;
  damageReduction: number;
  goldGainMultiplier: number;
  killRewardMultiplier: number;
  companionSlots: number;
  skillSlots: number;
}

export interface DrawResult {
  id: string;
  name: string;
  tier: number;
  isNew: boolean;
  level: number;
  shards: number;
  coinGain?: number;
}

export interface UpgradeDisplayInfo {
  key: UpgradeKey;
  label: string;
  level: number;
  currentText: string;
  nextText: string;
  cost: number;
  count: number;
  done: boolean;
}

export interface SkillDisplayInfo {
  id: string;
  name: string;
  rarity: CombatSkillRarity;
  type: CombatSkillType;
  description: string;
  triggerType: SkillTriggerType;
  level: number;
  maxLevel: number;
  unlocked: boolean;
  equipped: boolean;
  unlockCost: number;
  upgradeCost: number;
  cooldownSec: number;
  durationSec: number;
}

export interface ShopPurchaseHistoryEntry {
  itemId: string;
  dailyPurchasedCount: number;
  weeklyPurchasedCount: number;
  lastDailyResetAt: string;
  lastWeeklyResetAt: string;
}

export interface CompanionShopItemDefinition {
  id: string;
  name: string;
  category: "fragment" | "booster" | "material";
  currencyType: "companion_coin";
  price: number;
  rewardType: ShopRewardType;
  rewardValue: {
    tier?: CompanionTier;
    amount?: number;
    goldBoostRate?: number;
    durationSec?: number;
  };
  unlockCondition: {
    chapterClear: number;
  };
  dailyLimit: number | null;
  weeklyLimit: number | null;
  isEnabled: boolean;
}

export interface CompanionShopItemView {
  id: string;
  name: string;
  category: "fragment" | "booster" | "material";
  price: number;
  rewardType: ShopRewardType;
  rewardValue: {
    tier?: CompanionTier;
    amount?: number;
    goldBoostRate?: number;
    durationSec?: number;
  };
  unlocked: boolean;
  unlockText: string;
  buyable: boolean;
  buyBlockedReason: string | null;
  dailyLimit: number | null;
  dailyRemain: number | null;
  weeklyLimit: number | null;
  weeklyRemain: number | null;
}










