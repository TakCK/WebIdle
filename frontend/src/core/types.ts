export type EnemyType = "normal" | "midboss" | "chapterBoss";
export type CompanionRole = "atk" | "hp" | "speed" | "crit" | "util";
export type CompanionTier = 1 | 2 | 3 | 4;

export interface CompanionEffect {
  atk?: number;
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
  ownedEffect: CompanionEffect;
  equippedEffect: CompanionEffect;
}

export interface CompanionRuntime {
  level: number;
  shards: number;
}

export interface UpgradeLevels {
  attack: number;
  hp: number;
  speed: number;
}

export interface SkillLevels {
  critChance: number;
  critDamage: number;
  extraChance: number;
  extraCount: number;
  lifestealChance: number;
  lifestealAmount: number;
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
  stage: number;
  stageKillCount: number;
  level: number;
  exp: number;
  heroHp: number;
  drawCount: number;
  upgrades: UpgradeLevels;
  skills: SkillLevels;
  equippedCompanionIds: string[];
  companionRuntime: Record<string, CompanionRuntime>;
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
  skills: SkillLevels;
  equippedCompanionIds: string[];
  companionRuntime: Record<string, CompanionRuntime>;
  enemy: EnemyState;
  notice: Notice | null;
  transitionSecLeft: number;
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
  companionSlots: number;
}

export interface DrawResult {
  id: string;
  name: string;
  tier: number;
  isNew: boolean;
  level: number;
  shards: number;
}