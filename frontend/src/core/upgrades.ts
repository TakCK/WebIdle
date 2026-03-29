import type { UpgradeKey, UpgradeLevels } from "./types";

export interface UpgradeRule {
  key: UpgradeKey;
  label: string;
  baseCost: number;
  growth: number;
  maxLevel: number | null;
}

export const UPGRADE_RULES: Record<UpgradeKey, UpgradeRule> = {
  attack: { key: "attack", label: "공격력 강화", baseCost: 50, growth: 1.12, maxLevel: null },
  hp: { key: "hp", label: "체력 강화", baseCost: 40, growth: 1.11, maxLevel: null },
  attackSpeed: { key: "attackSpeed", label: "공격속도 강화", baseCost: 150, growth: 1.16, maxLevel: 180 },
  critRate: { key: "critRate", label: "치명타 확률 강화", baseCost: 180, growth: 1.17, maxLevel: 200 },
  critDamage: { key: "critDamage", label: "치명타 데미지 강화", baseCost: 170, growth: 1.17, maxLevel: 119 },
  extraHitRate: { key: "extraHitRate", label: "추가타 확률 강화", baseCost: 220, growth: 1.18, maxLevel: 200 },
  extraHitCount: { key: "extraHitCount", label: "추가타 횟수 강화 (10Lv당 +1회)", baseCost: 600, growth: 1.22, maxLevel: 50 },
  lifestealRate: { key: "lifestealRate", label: "흡혈 확률 강화", baseCost: 200, growth: 1.17, maxLevel: 200 },
  lifestealAmount: { key: "lifestealAmount", label: "흡혈 회복량 강화", baseCost: 190, growth: 1.16, maxLevel: 134 }
};

export const UPGRADE_ORDER: UpgradeKey[] = [
  "attack",
  "hp",
  "attackSpeed",
  "critRate",
  "critDamage",
  "extraHitRate",
  "extraHitCount",
  "lifestealRate",
  "lifestealAmount"
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function floor(value: number): number {
  return Math.floor(value);
}

export function defaultUpgradeLevels(): UpgradeLevels {
  return {
    attack: 0,
    hp: 0,
    attackSpeed: 0,
    critRate: 0,
    critDamage: 0,
    extraHitRate: 0,
    extraHitCount: 0,
    lifestealRate: 0,
    lifestealAmount: 0
  };
}

export function upgradeCostAtLevel(key: UpgradeKey, level: number): number {
  const rule = UPGRADE_RULES[key];
  return Math.max(1, floor(rule.baseCost * Math.pow(rule.growth, Math.max(0, level))));
}

export function upgradeUpgradableCount(key: UpgradeKey, currentLevel: number, requested: number): number {
  const rule = UPGRADE_RULES[key];
  const ask = Math.max(1, floor(requested));
  if (rule.maxLevel === null) return ask;
  return clamp(rule.maxLevel - currentLevel, 0, ask);
}

export function attackMultiplier(level: number): number {
  return Math.pow(1.08, Math.max(0, level));
}

export function hpMultiplier(level: number): number {
  return Math.pow(1.1, Math.max(0, level));
}

export function attackSpeedValue(level: number): number {
  return Math.min(10, 1 + 0.05 * Math.max(0, level));
}

export function critRatePercent(level: number): number {
  return Math.min(100, 0.5 * Math.max(0, level));
}

export function critDamagePercent(level: number): number {
  return Math.min(1000, 50 + 8 * Math.max(0, level));
}

export function extraHitRatePercent(level: number): number {
  return Math.min(50, 0.25 * Math.max(0, level));
}

export function extraHitCountValue(level: number): number {
  return Math.min(5, Math.floor(Math.max(0, level) / 10));
}

export function lifestealRatePercent(level: number): number {
  return Math.min(50, 0.25 * Math.max(0, level));
}

export function lifestealAmountPercent(level: number): number {
  return Math.min(20, 0.15 * Math.max(0, level));
}

export function upgradeCurrentNumericValue(key: UpgradeKey, level: number): number {
  switch (key) {
    case "attack":
      return (attackMultiplier(level) - 1) * 100;
    case "hp":
      return (hpMultiplier(level) - 1) * 100;
    case "attackSpeed":
      return attackSpeedValue(level);
    case "critRate":
      return critRatePercent(level);
    case "critDamage":
      return critDamagePercent(level);
    case "extraHitRate":
      return extraHitRatePercent(level);
    case "extraHitCount":
      return extraHitCountValue(level);
    case "lifestealRate":
      return lifestealRatePercent(level);
    case "lifestealAmount":
      return lifestealAmountPercent(level);
    default:
      return 0;
  }
}

