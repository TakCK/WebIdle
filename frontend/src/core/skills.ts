import type { CombatSkillDefinition, CombatSkillRarity, SkillStatValues } from "./types";

export const SKILL_UNLOCK_COST: Record<CombatSkillRarity, number> = {
  common: 50,
  rare: 100,
  epic: 200,
  legendary: 400
};

export const SKILL_UPGRADE_BASE_COST: Record<CombatSkillRarity, number> = {
  common: 20,
  rare: 30,
  epic: 45,
  legendary: 70
};

export const COMBAT_SKILLS: CombatSkillDefinition[] = [
  {
    id: "skill-berserk",
    name: "버서크",
    type: "attack",
    rarity: "common",
    description: "8초간 공격속도 증가",
    maxLevel: 10,
    cooldownSec: 25,
    durationSec: 8,
    triggerType: "auto_interval",
    baseValues: { attackSpeedRate: 0.4 },
    scalingPerLevel: { attackSpeedRate: 0.05 }
  },
  {
    id: "skill-fury-stance",
    name: "맹공 태세",
    type: "attack",
    rarity: "common",
    description: "8초간 공격력 증가",
    maxLevel: 10,
    cooldownSec: 30,
    durationSec: 8,
    triggerType: "auto_interval",
    baseValues: { attackRate: 0.5 },
    scalingPerLevel: { attackRate: 0.06 }
  },
  {
    id: "skill-precision",
    name: "정밀 타격",
    type: "crit",
    rarity: "common",
    description: "6초간 치명타 확률 증가",
    maxLevel: 10,
    cooldownSec: 22,
    durationSec: 6,
    triggerType: "auto_interval",
    baseValues: { critChance: 0.2 },
    scalingPerLevel: { critChance: 0.03 }
  },
  {
    id: "skill-killing-intent",
    name: "살의 개방",
    type: "crit",
    rarity: "rare",
    description: "6초간 치명타 데미지 증가",
    maxLevel: 10,
    cooldownSec: 28,
    durationSec: 6,
    triggerType: "auto_interval",
    baseValues: { critDamage: 0.8 },
    scalingPerLevel: { critDamage: 0.12 }
  },
  {
    id: "skill-chain-start",
    name: "연쇄 개시",
    type: "hybrid",
    rarity: "rare",
    description: "6초간 추가타 확률 증가",
    maxLevel: 10,
    cooldownSec: 30,
    durationSec: 6,
    triggerType: "auto_interval",
    baseValues: { extraHitRate: 0.15 },
    scalingPerLevel: { extraHitRate: 0.02 }
  },
  {
    id: "skill-rampage",
    name: "폭주",
    type: "hybrid",
    rarity: "epic",
    description: "5초간 공속/치확 동시 증가",
    maxLevel: 10,
    cooldownSec: 35,
    durationSec: 5,
    triggerType: "boss_start",
    allowAutoFallback: true,
    baseValues: { attackSpeedRate: 0.25, critChance: 0.1 },
    scalingPerLevel: { attackSpeedRate: 0.03, critChance: 0.01 }
  },
  {
    id: "skill-blood-siphon",
    name: "혈기 흡수",
    type: "survival",
    rarity: "common",
    description: "8초간 흡혈 회복량 증가",
    maxLevel: 10,
    cooldownSec: 30,
    durationSec: 8,
    triggerType: "low_hp",
    lowHpThreshold: 0.6,
    baseValues: { lifestealAmount: 0.08 },
    scalingPerLevel: { lifestealAmount: 0.01 }
  },
  {
    id: "skill-iron-skin",
    name: "강철 피부",
    type: "survival",
    rarity: "rare",
    description: "5초간 받는 피해 감소",
    maxLevel: 10,
    cooldownSec: 32,
    durationSec: 5,
    triggerType: "low_hp",
    lowHpThreshold: 0.5,
    baseValues: { damageReduction: 0.35 },
    scalingPerLevel: { damageReduction: 0.03 }
  },
  {
    id: "skill-emergency-regen",
    name: "응급 재생",
    type: "survival",
    rarity: "epic",
    description: "최대 체력 비례 즉시 회복",
    maxLevel: 10,
    cooldownSec: 40,
    durationSec: 0,
    triggerType: "low_hp",
    lowHpThreshold: 0.35,
    baseValues: { healMaxHpInstant: 0.2 },
    scalingPerLevel: { healMaxHpInstant: 0.03 }
  },
  {
    id: "skill-last-stand",
    name: "최후의 저항",
    type: "survival",
    rarity: "legendary",
    description: "치명 피해 직전 자동 생존",
    maxLevel: 10,
    cooldownSec: 90,
    durationSec: 0,
    triggerType: "lethal_damage",
    baseValues: { lethalHealMaxHp: 0.25 },
    scalingPerLevel: { lethalHealMaxHp: 0.04 }
  },
  {
    id: "skill-golden-touch",
    name: "황금 손길",
    type: "utility",
    rarity: "common",
    description: "10초간 골드 획득량 증가",
    maxLevel: 10,
    cooldownSec: 45,
    durationSec: 10,
    triggerType: "auto_interval",
    baseValues: { goldGain: 0.4 },
    scalingPerLevel: { goldGain: 0.05 }
  },
  {
    id: "skill-hunting-instinct",
    name: "사냥 본능",
    type: "utility",
    rarity: "rare",
    description: "8초간 처치 보상 증가",
    maxLevel: 10,
    cooldownSec: 40,
    durationSec: 8,
    triggerType: "on_kill",
    allowAutoFallback: true,
    baseValues: { killReward: 0.3 },
    scalingPerLevel: { killReward: 0.04 }
  }
];

const skillById = new Map<string, CombatSkillDefinition>(COMBAT_SKILLS.map((s) => [s.id, s]));

function valueOrZero(v: number | undefined): number {
  return v ?? 0;
}

export function getCombatSkillById(id: string): CombatSkillDefinition | undefined {
  return skillById.get(id);
}

export function skillUnlockCost(def: CombatSkillDefinition): number {
  return SKILL_UNLOCK_COST[def.rarity];
}

export function skillUpgradeCost(def: CombatSkillDefinition, currentLevel: number): number {
  const lv = Math.max(1, currentLevel);
  const base = SKILL_UPGRADE_BASE_COST[def.rarity];
  return Math.max(1, Math.floor(base * Math.pow(1.5, lv - 1)));
}

export function skillValuesAtLevel(def: CombatSkillDefinition, level: number): Required<SkillStatValues> {
  const lv = Math.max(1, Math.min(def.maxLevel, Math.floor(level)));
  const p = lv - 1;

  const values: Required<SkillStatValues> = {
    attackRate: valueOrZero(def.baseValues.attackRate) + valueOrZero(def.scalingPerLevel.attackRate) * p,
    attackSpeedRate: valueOrZero(def.baseValues.attackSpeedRate) + valueOrZero(def.scalingPerLevel.attackSpeedRate) * p,
    critChance: valueOrZero(def.baseValues.critChance) + valueOrZero(def.scalingPerLevel.critChance) * p,
    critDamage: valueOrZero(def.baseValues.critDamage) + valueOrZero(def.scalingPerLevel.critDamage) * p,
    extraHitRate: valueOrZero(def.baseValues.extraHitRate) + valueOrZero(def.scalingPerLevel.extraHitRate) * p,
    lifestealAmount: valueOrZero(def.baseValues.lifestealAmount) + valueOrZero(def.scalingPerLevel.lifestealAmount) * p,
    damageReduction: valueOrZero(def.baseValues.damageReduction) + valueOrZero(def.scalingPerLevel.damageReduction) * p,
    healMaxHpInstant: valueOrZero(def.baseValues.healMaxHpInstant) + valueOrZero(def.scalingPerLevel.healMaxHpInstant) * p,
    lethalHealMaxHp: valueOrZero(def.baseValues.lethalHealMaxHp) + valueOrZero(def.scalingPerLevel.lethalHealMaxHp) * p,
    goldGain: valueOrZero(def.baseValues.goldGain) + valueOrZero(def.scalingPerLevel.goldGain) * p,
    killReward: valueOrZero(def.baseValues.killReward) + valueOrZero(def.scalingPerLevel.killReward) * p
  };

  values.damageReduction = Math.min(0.7, Math.max(0, values.damageReduction));
  return values;
}

export function skillRarityText(rarity: CombatSkillRarity): string {
  if (rarity === "common") return "일반";
  if (rarity === "rare") return "희귀";
  if (rarity === "epic") return "영웅";
  return "전설";
}
