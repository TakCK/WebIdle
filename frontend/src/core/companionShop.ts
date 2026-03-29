import type { CompanionShopItemDefinition, CompanionTier } from "./types";

export const COMPANION_DUPLICATE_FRAGMENT_REWARD: Record<CompanionTier, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 5
};

export const FRAGMENT_TO_COMPANION_COIN: Record<CompanionTier, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 6
};

export const TIER4_SELECTOR_ENABLED = true;

export const COMPANION_SHOP_ITEMS: CompanionShopItemDefinition[] = [
  {
    id: "shop_t1_selector_fragment",
    name: "T1 선택 조각 x1",
    category: "fragment",
    currencyType: "companion_coin",
    price: 15,
    rewardType: "tier_fragment_selector",
    rewardValue: { tier: 1, amount: 1 },
    unlockCondition: { chapterClear: 1 },
    dailyLimit: 5,
    weeklyLimit: null,
    isEnabled: true
  },
  {
    id: "shop_t2_selector_fragment",
    name: "T2 선택 조각 x1",
    category: "fragment",
    currencyType: "companion_coin",
    price: 40,
    rewardType: "tier_fragment_selector",
    rewardValue: { tier: 2, amount: 1 },
    unlockCondition: { chapterClear: 1 },
    dailyLimit: 3,
    weeklyLimit: null,
    isEnabled: true
  },
  {
    id: "shop_t3_random_fragment",
    name: "T3 랜덤 조각 x1",
    category: "fragment",
    currencyType: "companion_coin",
    price: 80,
    rewardType: "tier_fragment_random",
    rewardValue: { tier: 3, amount: 1 },
    unlockCondition: { chapterClear: 1 },
    dailyLimit: 2,
    weeklyLimit: null,
    isEnabled: true
  },
  {
    id: "shop_gold_boost_small",
    name: "골드 부스터(소)",
    category: "booster",
    currencyType: "companion_coin",
    price: 30,
    rewardType: "gold_boost_small",
    rewardValue: { goldBoostRate: 0.2, durationSec: 600 },
    unlockCondition: { chapterClear: 1 },
    dailyLimit: 3,
    weeklyLimit: null,
    isEnabled: true
  },
  {
    id: "shop_gold_boost_medium",
    name: "골드 부스터(중)",
    category: "booster",
    currencyType: "companion_coin",
    price: 70,
    rewardType: "gold_boost_medium",
    rewardValue: { goldBoostRate: 0.5, durationSec: 600 },
    unlockCondition: { chapterClear: 1 },
    dailyLimit: 2,
    weeklyLimit: null,
    isEnabled: true
  },
  {
    id: "shop_companion_growth_ticket",
    name: "동료 성장 촉진제 x1",
    category: "material",
    currencyType: "companion_coin",
    price: 60,
    rewardType: "companion_growth_ticket",
    rewardValue: { amount: 1 },
    unlockCondition: { chapterClear: 1 },
    dailyLimit: null,
    weeklyLimit: null,
    isEnabled: true
  },
  {
    id: "shop_t3_selector_fragment",
    name: "T3 선택 조각 x1",
    category: "fragment",
    currencyType: "companion_coin",
    price: 140,
    rewardType: "tier_fragment_selector",
    rewardValue: { tier: 3, amount: 1 },
    unlockCondition: { chapterClear: 6 },
    dailyLimit: null,
    weeklyLimit: 2,
    isEnabled: true
  },
  {
    id: "shop_t4_random_fragment",
    name: "T4 랜덤 조각 x1",
    category: "fragment",
    currencyType: "companion_coin",
    price: 350,
    rewardType: "tier_fragment_random",
    rewardValue: { tier: 4, amount: 1 },
    unlockCondition: { chapterClear: 10 },
    dailyLimit: null,
    weeklyLimit: 1,
    isEnabled: true
  },
  {
    id: "shop_t4_selector_fragment",
    name: "T4 선택 조각 x1",
    category: "fragment",
    currencyType: "companion_coin",
    price: 600,
    rewardType: "tier_fragment_selector",
    rewardValue: { tier: 4, amount: 1 },
    unlockCondition: { chapterClear: 15 },
    dailyLimit: null,
    weeklyLimit: 1,
    isEnabled: TIER4_SELECTOR_ENABLED
  }
];

export function formatDailyResetKey(timeMs: number): string {
  const d = new Date(timeMs);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatWeeklyResetKey(timeMs: number): string {
  const d = new Date(timeMs);
  const day = d.getDay();
  const deltaToMonday = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + deltaToMonday);
  return formatDailyResetKey(d.getTime());
}
