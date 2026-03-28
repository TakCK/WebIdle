import {
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
  GOLD_GROWTH,
  MAX_CHAPTER,
  MAX_STAGE,
  MID_BOSS_MULTIPLIER,
  PLAYER_BASE_ATTACK,
  PLAYER_BASE_ATTACK_SPEED,
  PLAYER_BASE_HP,
  SAVE_VERSION,
  SKILL_COST,
  SKILL_LIMIT,
  STORAGE_KEY,
  UPGRADE_ATTACK,
  UPGRADE_HP,
  UPGRADE_SPEED,
  chapterBossMultiplier
} from "./config";
import type {
  CompanionDefinition,
  CompanionEffect,
  CompanionRuntime,
  DerivedStats,
  DrawResult,
  EnemyState,
  EnemyType,
  GameState,
  Notice,
  PersistedGameData
} from "./types";

export interface ActionFeedback {
  ok: boolean;
  message: string;
  draws?: DrawResult[];
}

const companionById = new Map<string, CompanionDefinition>(COMPANIONS.map((v) => [v.id, v]));

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function floor(value: number): number {
  return Math.floor(value);
}

function growthMultiplierByStage(stageIndex: number, early: number, mid: number, late: number): number {
  const steps = Math.max(0, floor(stageIndex) - 1);
  const earlySteps = clamp(steps, 0, 99);
  const midSteps = clamp(steps - 99, 0, 100);
  const lateSteps = Math.max(0, steps - 199);
  return Math.pow(early, earlySteps) * Math.pow(mid, midSteps) * Math.pow(late, lateSteps);
}

function upgradeCost(baseCost: number, growth: number, level: number): number {
  return Math.max(1, floor(baseCost * Math.pow(growth, Math.max(0, level))));
}

function randomizeDamage(raw: number): number {
  const bounded = Math.max(1, raw);
  return Math.max(1, floor(bounded * (0.95 + Math.random() * 0.1)));
}

function sumSequentialCost(count: number, fn: (idx: number) => number): number {
  let total = 0;
  for (let i = 0; i < count; i += 1) total += Math.max(0, floor(fn(i)));
  return total;
}

function emptyEffect(): Required<CompanionEffect> {
  return {
    atk: 0,
    hp: 0,
    speed: 0,
    crit: 0,
    critDmg: 0,
    cleave: 0,
    lifesteal: 0,
    gold: 0
  };
}

function addEffect(target: Required<CompanionEffect>, base: CompanionEffect, scale: number): void {
  target.atk += (base.atk ?? 0) * scale;
  target.hp += (base.hp ?? 0) * scale;
  target.speed += (base.speed ?? 0) * scale;
  target.crit += (base.crit ?? 0) * scale;
  target.critDmg += (base.critDmg ?? 0) * scale;
  target.cleave += (base.cleave ?? 0) * scale;
  target.lifesteal += (base.lifesteal ?? 0) * scale;
  target.gold += (base.gold ?? 0) * scale;
}

function effectScale(tier: 1 | 2 | 3 | 4, level: number, scope: "owned" | "equipped"): number {
  if (level <= 0) return 0;
  const growth = COMPANION_LEVELUP_EFFECT_GROWTH[tier][scope];
  return Math.pow(1 + growth, Math.max(0, level - 1));
}

function stageOrdinal(chapter: number, stage: number): number {
  return (clamp(floor(chapter), 1, MAX_CHAPTER) - 1) * MAX_STAGE + clamp(floor(stage), 1, MAX_STAGE);
}

function expNeed(level: number): number {
  return floor(12 * Math.pow(1.5, Math.max(0, level - 1)));
}

function pickTierByRate(): 1 | 2 | 3 | 4 {
  const roll = Math.random();
  let acc = 0;
  const tiers: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];
  for (const tier of tiers) {
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

export class IdleGameEngine {
  private heroAttackTimer = 0;
  private enemyAttackTimer = 0;
  private noticeRemain = 0;
  private onTransitionDone: (() => void) | null = null;

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
    upgrades: {
      attack: 0,
      hp: 0,
      speed: 0
    },
    skills: {
      critChance: 0,
      critDamage: 0,
      extraChance: 0,
      extraCount: 0,
      lifestealChance: 0,
      lifestealAmount: 0
    },
    equippedCompanionIds: [],
    companionRuntime: {},
    enemy: createInitialEnemy(),
    notice: null,
    transitionSecLeft: 0
  };

  constructor() {
    this.spawnNormalEnemy();
    this.state.heroHp = this.getDerivedStats().maxHp;
  }

  getStorageKey(): string {
    return STORAGE_KEY;
  }

  getCompanions(): CompanionDefinition[] {
    return COMPANIONS;
  }

  getCompanionRuntime(id: string): CompanionRuntime {
    return this.state.companionRuntime[id] ?? { level: 0, shards: 0 };
  }

  isCompanionOwned(id: string): boolean {
    return this.getCompanionRuntime(id).level > 0;
  }

  getClearedChapterCount(): number {
    return Math.max(0, this.state.chapter - 1);
  }

  getUnlockedCompanionSlots(): number {
    const cleared = this.getClearedChapterCount();
    let slots = 1;
    if (cleared >= 3) slots += 1;
    if (cleared >= 7) slots += 1;
    return slots;
  }

  private normalizeCompanionState(): void {
    const valid = new Set(COMPANIONS.map((v) => v.id));
    const runtime = this.state.companionRuntime;
    for (const id of Object.keys(runtime)) {
      if (!valid.has(id)) {
        delete runtime[id];
        continue;
      }
      runtime[id].level = clamp(floor(runtime[id].level), 0, COMPANION_MAX_LEVEL);
      runtime[id].shards = Math.max(0, floor(runtime[id].shards));
      if (runtime[id].level <= 0) {
        delete runtime[id];
      }
    }

    const slots = this.getUnlockedCompanionSlots();
    const unique = Array.from(new Set(this.state.equippedCompanionIds))
      .filter((id) => this.isCompanionOwned(id))
      .slice(0, slots);
    this.state.equippedCompanionIds = unique;
  }

  private companionEffectTotals(): Required<CompanionEffect> {
    this.normalizeCompanionState();
    const total = emptyEffect();

    for (const def of COMPANIONS) {
      const runtime = this.getCompanionRuntime(def.id);
      if (runtime.level <= 0) continue;
      const ownedScale = effectScale(def.tier, runtime.level, "owned");
      addEffect(total, def.ownedEffect, ownedScale);
    }

    for (const id of this.state.equippedCompanionIds) {
      const def = companionById.get(id);
      if (!def) continue;
      const runtime = this.getCompanionRuntime(id);
      if (runtime.level <= 0) continue;
      const equippedScale = effectScale(def.tier, runtime.level, "equipped");
      addEffect(total, def.equippedEffect, equippedScale);
    }

    return total;
  }

  getDerivedStats(): DerivedStats {
    const effects = this.companionEffectTotals();
    const attack = Math.max(
      1,
      floor(PLAYER_BASE_ATTACK * Math.pow(1 + UPGRADE_ATTACK.perLevelMultiplier, this.state.upgrades.attack) * (1 + effects.atk))
    );
    const maxHp = Math.max(
      1,
      floor(PLAYER_BASE_HP * Math.pow(1 + UPGRADE_HP.perLevelMultiplier, this.state.upgrades.hp) * (1 + effects.hp))
    );
    const baseAttackSpeed = Math.min(
      UPGRADE_SPEED.cap,
      Math.max(PLAYER_BASE_ATTACK_SPEED, PLAYER_BASE_ATTACK_SPEED + UPGRADE_SPEED.perLevel * this.state.upgrades.speed)
    );
    const attackSpeed = Math.max(PLAYER_BASE_ATTACK_SPEED, Math.min(UPGRADE_SPEED.cap, baseAttackSpeed * (1 + effects.speed)));

    const critChance = clamp(0.01 * this.state.skills.critChance + effects.crit, 0, 1);
    const critDamageBonus = clamp(0.5 + this.state.skills.critDamage * 0.12 + effects.critDmg, 0, 10);
    const extraChance = clamp(0.005 * this.state.skills.extraChance + effects.cleave, 0, 0.5);
    const extraCount = clamp(Math.floor(this.state.skills.extraCount / 5), 0, 5);
    const lifestealChance = clamp(0.005 * this.state.skills.lifestealChance + effects.lifesteal, 0, 0.5);
    const lifestealAmount = clamp(0.0025 * this.state.skills.lifestealAmount, 0, 0.2);

    const expectedDps = attack * attackSpeed * (1 + critChance * critDamageBonus) * (1 + extraChance * extraCount);
    const combatPower = floor(
      attack * 2.7 +
      maxHp * 0.26 +
      attackSpeed * 130 +
      critChance * 220 +
      critDamageBonus * 120 +
      extraChance * 180 +
      extraCount * 75 +
      lifestealChance * 120 +
      lifestealAmount * 350
    );

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
      defense: 1,
      companionSlots: this.getUnlockedCompanionSlots()
    };
  }

  private stageIndex(): number {
    return stageOrdinal(this.state.chapter, this.state.stage);
  }

  private familyForStage(stageIdx: number) {
    return ENEMY_FAMILIES[Math.max(0, stageIdx - 1) % ENEMY_FAMILIES.length];
  }

  private normalEnemyBaseStats(chapter = this.state.chapter, stage = this.state.stage): { atk: number; hp: number; stageIdx: number } {
    const stageIdx = stageOrdinal(chapter, stage);
    const atkMult = growthMultiplierByStage(stageIdx, ENEMY_ATK_GROWTH.early, ENEMY_ATK_GROWTH.mid, ENEMY_ATK_GROWTH.late);
    const hpMult = growthMultiplierByStage(stageIdx, ENEMY_HP_GROWTH.early, ENEMY_HP_GROWTH.mid, ENEMY_HP_GROWTH.late);
    return {
      stageIdx,
      atk: Math.max(1, floor(ENEMY_BASE_ATTACK * atkMult)),
      hp: Math.max(1, floor(ENEMY_BASE_HP * hpMult))
    };
  }

  private normalGoldForStage(chapter = this.state.chapter, stage = this.state.stage): number {
    const idx = stageOrdinal(chapter, stage);
    const mult = growthMultiplierByStage(idx, GOLD_GROWTH.early, GOLD_GROWTH.mid, GOLD_GROWTH.late);
    return Math.max(1, floor(GOLD_BASE * mult));
  }

  private chapterClearGold(chapter: number): number {
    const perMob = this.normalGoldForStage(chapter, MAX_STAGE);
    const goldMult = 1 + this.companionEffectTotals().gold;
    return Math.max(1, floor(perMob * 20 * goldMult));
  }

  private enemyGoldReward(type: EnemyType): number {
    const base = this.normalGoldForStage();
    const goldMult = 1 + this.companionEffectTotals().gold;
    if (type === "midboss") return Math.max(1, floor(base * MID_BOSS_MULTIPLIER.gold * goldMult));
    if (type === "chapterBoss") return Math.max(1, floor(base * CHAPTER_BOSS_GOLD_MULTIPLIER * goldMult));
    return Math.max(1, floor(base * goldMult));
  }

  private setEnemy(type: EnemyType, atk: number, hp: number, familyIndexSeed: number, interval: number): void {
    const family = this.familyForStage(familyIndexSeed);
    const name = type === "normal" ? family.normal : type === "midboss" ? family.midboss : family.chapterBoss;
    const spritePath = family.sprite[type];
    this.state.enemy = {
      type,
      name,
      familyId: family.id,
      atk: Math.max(1, floor(atk)),
      hp: Math.max(1, floor(hp)),
      hpMax: Math.max(1, floor(hp)),
      attackInterval: Math.max(0.45, interval),
      spritePath
    };
    this.enemyAttackTimer = 0;
    this.state.bossTimeLeft = type === "normal" ? 0 : BOSS_TIME_LIMIT;
  }

  private spawnNormalEnemy(): void {
    const base = this.normalEnemyBaseStats();
    const interval = Math.max(0.58, 1.02 - base.stageIdx * 0.0005);
    this.setEnemy("normal", base.atk, base.hp, base.stageIdx, interval);
  }

  private spawnMidBoss(): void {
    const base = this.normalEnemyBaseStats();
    this.setEnemy(
      "midboss",
      floor(base.atk * MID_BOSS_MULTIPLIER.atk),
      floor(base.hp * MID_BOSS_MULTIPLIER.hp),
      base.stageIdx,
      0.6
    );
  }

  private spawnChapterBoss(): void {
    const base = this.normalEnemyBaseStats();
    const mult = chapterBossMultiplier(this.state.chapter);
    this.setEnemy(
      "chapterBoss",
      floor(base.atk * mult.atk),
      floor(base.hp * mult.hp),
      base.stageIdx,
      0.5
    );
  }

  private setNotice(text: string, kind: Notice["kind"] = "info", sec = 1.2): void {
    this.state.notice = { text, kind };
    this.noticeRemain = sec;
  }

  private startTransition(text: string, kind: Notice["kind"], done: () => void): void {
    this.state.transitionSecLeft = 1;
    this.onTransitionDone = done;
    this.setNotice(text, kind, 1);
    this.heroAttackTimer = 0;
    this.enemyAttackTimer = 0;
  }

  private clearNoticeTick(dt: number): void {
    if (this.noticeRemain <= 0) return;
    this.noticeRemain -= dt;
    if (this.noticeRemain <= 0) {
      this.state.notice = null;
    }
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
      if (this.state.bossTimeLeft <= 0) {
        this.resetCurrentStage("보스 제한시간 초과로 스테이지가 초기화됩니다");
      }
    }
  }

  private heroStrike(derived: DerivedStats): void {
    if (this.state.enemy.hp <= 0 || this.state.heroHp <= 0) return;

    const crit = Math.random() < derived.critChance;
    const extraTrigger = derived.extraCount > 0 && Math.random() < derived.extraChance;
    const hitCount = 1 + (extraTrigger ? derived.extraCount : 0);

    for (let i = 0; i < hitCount; i += 1) {
      const damageBase = crit ? derived.attack * (1 + derived.critDamageBonus) : derived.attack;
      const damage = randomizeDamage(damageBase);
      this.state.enemy.hp = Math.max(0, this.state.enemy.hp - damage);
      if (this.state.enemy.hp <= 0) break;
    }

    if (Math.random() < derived.lifestealChance) {
      const heal = floor(derived.maxHp * derived.lifestealAmount);
      if (heal > 0) this.state.heroHp = clamp(this.state.heroHp + heal, 0, derived.maxHp);
    }

    if (this.state.enemy.hp <= 0) {
      this.onEnemyDefeated();
    }
  }

  private enemyStrike(derived: DerivedStats): void {
    if (this.state.enemy.hp <= 0 || this.state.heroHp <= 0) return;
    const damage = randomizeDamage(Math.max(1, this.state.enemy.atk - derived.defense));
    this.state.heroHp = Math.max(0, this.state.heroHp - damage);
    if (this.state.heroHp <= 0) {
      this.resetCurrentStage("플레이어 사망으로 스테이지가 초기화됩니다");
    }
  }

  private onEnemyDefeated(): void {
    const defeatedType = this.state.enemy.type;
    const rewardGold = this.enemyGoldReward(defeatedType);
    this.state.gold += rewardGold;

    if (Math.random() < DIAMOND_DROP_CHANCE) {
      this.state.diamonds += 1;
    }

    const expGain = Math.max(6, floor(6 + this.stageIndex() * 0.8));
    this.gainExp(expGain);

    const label = defeatedType === "midboss" ? "중간보스 처치" : defeatedType === "chapterBoss" ? "챕터보스 처치" : "적 처치";
    this.startTransition(label, "success", () => {
      this.advanceAfterKill(defeatedType);
    });
  }

  private gainExp(exp: number): void {
    this.state.exp += Math.max(0, floor(exp));
    while (this.state.exp >= expNeed(this.state.level)) {
      this.state.exp -= expNeed(this.state.level);
      this.state.level += 1;
      this.state.heroHp = Math.min(this.getDerivedStats().maxHp, this.state.heroHp + 8);
      this.setNotice("흡혈 발동", "success", 1.1);
    }
  }

  private healAfterBossClear(): void {
    this.state.heroHp = this.getDerivedStats().maxHp;
  }

  private advanceAfterKill(type: EnemyType): void {
    if (type === "normal") {
      this.state.stageKillCount += 1;
      if (this.state.stageKillCount >= ENEMIES_PER_STAGE) {
        this.state.stageKillCount = ENEMIES_PER_STAGE;
        this.spawnMidBoss();
      } else {
        this.spawnNormalEnemy();
      }
      return;
    }

    if (type === "midboss") {
      this.state.stageKillCount = 0;
      if (this.state.stage >= MAX_STAGE) {
        this.spawnChapterBoss();
      } else {
        this.state.stage = clamp(this.state.stage + 1, 1, MAX_STAGE);
        this.spawnNormalEnemy();
      }
      this.healAfterBossClear();
      this.setNotice("스테이지 클리어 - 체력 회복", "success", 1.2);
      return;
    }

    const clearedChapter = this.state.chapter;
    this.state.gold += this.chapterClearGold(clearedChapter);
    this.state.diamonds += CHAPTER_CLEAR_DIAMOND_REWARD;
    if (this.state.chapter < MAX_CHAPTER) {
      this.state.chapter += 1;
      this.state.stage = 1;
    } else {
      this.state.chapter = MAX_CHAPTER;
      this.state.stage = MAX_STAGE;
    }
    this.state.stageKillCount = 0;
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

  getStageLabel(): string {
    return `${this.state.chapter}-${this.state.stage}`;
  }

  getStageProgressRate(): number {
    return clamp(this.state.stageKillCount / ENEMIES_PER_STAGE, 0, 1);
  }

  getAttackUpgradeCost(batch: number): number {
    const count = Math.max(1, floor(batch));
    return sumSequentialCost(count, (i) => upgradeCost(UPGRADE_ATTACK.baseCost, UPGRADE_ATTACK.growth, this.state.upgrades.attack + i));
  }

  getHpUpgradeCost(batch: number): number {
    const count = Math.max(1, floor(batch));
    return sumSequentialCost(count, (i) => upgradeCost(UPGRADE_HP.baseCost, UPGRADE_HP.growth, this.state.upgrades.hp + i));
  }

  getSpeedUpgradableCount(batch: number): number {
    const requested = Math.max(1, floor(batch));
    const maxLevel = floor((UPGRADE_SPEED.cap - PLAYER_BASE_ATTACK_SPEED) / UPGRADE_SPEED.perLevel);
    return clamp(maxLevel - this.state.upgrades.speed, 0, requested);
  }

  getSpeedUpgradeCost(batch: number): number {
    const count = this.getSpeedUpgradableCount(batch);
    if (count <= 0) return 0;
    return sumSequentialCost(count, (i) => upgradeCost(UPGRADE_SPEED.baseCost, UPGRADE_SPEED.growth, this.state.upgrades.speed + i));
  }

  private spendGold(amount: number): boolean {
    if (amount <= 0) return false;
    if (this.state.gold < amount) return false;
    this.state.gold -= amount;
    return true;
  }

  private skillUpgradableCount(key: keyof typeof SKILL_LIMIT, batch: number): number {
    const maxLv = SKILL_LIMIT[key];
    const current = this.state.skills[key];
    return clamp(batch, 0, maxLv - current);
  }

  private skillUpgradeCost(key: keyof typeof SKILL_COST, batch: number): number {
    const count = this.skillUpgradableCount(key, batch);
    if (count <= 0) return 0;
    const conf = SKILL_COST[key];
    const current = this.state.skills[key];
    return sumSequentialCost(count, (i) => upgradeCost(conf.baseCost, conf.growth, current + i));
  }

  upgradeAttack(batch = 1): ActionFeedback {
    const count = Math.max(1, floor(batch));
    const cost = this.getAttackUpgradeCost(count);
    if (!this.spendGold(cost)) return { ok: false, message: "골드가 부족합니다" };
    this.state.upgrades.attack += count;
    return { ok: true, message: `공격력 ${count}회 강화` };
  }

  upgradeHp(batch = 1): ActionFeedback {
    const count = Math.max(1, floor(batch));
    const cost = this.getHpUpgradeCost(count);
    if (!this.spendGold(cost)) return { ok: false, message: "골드가 부족합니다" };

    for (let i = 0; i < count; i += 1) {
      const before = this.getDerivedStats().maxHp;
      this.state.upgrades.hp += 1;
      const after = this.getDerivedStats().maxHp;
      this.state.heroHp = Math.min(after, this.state.heroHp + (after - before));
    }

    return { ok: true, message: `체력 ${count}회 강화` };
  }

  upgradeSpeed(batch = 1): ActionFeedback {
    const count = this.getSpeedUpgradableCount(batch);
    if (count <= 0) return { ok: false, message: "공격속도는 최대치입니다" };
    const cost = this.getSpeedUpgradeCost(count);
    if (!this.spendGold(cost)) return { ok: false, message: "골드가 부족합니다" };
    this.state.upgrades.speed += count;
    return { ok: true, message: `공격속도 ${count}회 강화` };
  }

  upgradeSkill(key: keyof typeof SKILL_COST, batch = 1): ActionFeedback {
    const count = this.skillUpgradableCount(key, Math.max(1, floor(batch)));
    if (count <= 0) return { ok: false, message: "강화 완료" };
    const cost = this.skillUpgradeCost(key, count);
    if (!this.spendGold(cost)) return { ok: false, message: "골드가 부족합니다" };
    this.state.skills[key] += count;
    return { ok: true, message: `${this.skillLabel(key)} ${count}회 강화` };
  }

  getSkillUpgradeCost(key: keyof typeof SKILL_COST, batch = 1): { cost: number; count: number; done: boolean } {
    const count = this.skillUpgradableCount(key, Math.max(1, floor(batch)));
    if (count <= 0) return { cost: 0, count: 0, done: true };
    return { cost: this.skillUpgradeCost(key, count), count, done: false };
  }

  private skillLabel(key: keyof typeof SKILL_COST): string {
    const map: Record<keyof typeof SKILL_COST, string> = {
      critChance: "치명타 확률",
      critDamage: "치명타 데미지",
      extraChance: "추가타 확률",
      extraCount: "추가타 횟수",
      lifestealChance: "흡혈 확률",
      lifestealAmount: "흡혈 회복량"
    };
    return map[key];
  }

  drawCompanions(drawCount: 1 | 11): ActionFeedback {
    const cost = drawCount === 11 ? COMPANION_DRAW_COST.multi11 : COMPANION_DRAW_COST.single;
    if (this.state.diamonds < cost) return { ok: false, message: "다이아가 부족합니다" };

    this.state.diamonds -= cost;
    this.state.drawCount += drawCount;

    const draws: DrawResult[] = [];
    for (let i = 0; i < drawCount; i += 1) {
      const tier = pickTierByRate();
      const tierPool = COMPANIONS.filter((v) => v.tier === tier);
      const pick = tierPool[Math.floor(Math.random() * tierPool.length)] ?? COMPANIONS[0];
      const runtime = this.getCompanionRuntime(pick.id);
      const isNew = runtime.level <= 0;
      if (isNew) {
        this.state.companionRuntime[pick.id] = { level: 1, shards: 0 };
      } else {
        this.state.companionRuntime[pick.id] = {
          level: runtime.level,
          shards: runtime.shards + 1
        };
      }
      const after = this.getCompanionRuntime(pick.id);
      draws.push({ id: pick.id, name: pick.name, tier: pick.tier, isNew, level: after.level, shards: after.shards });
    }

    this.normalizeCompanionState();
    return {
      ok: true,
      message: drawCount === 11 ? "11연 동료 뽑기 완료" : "동료 뽑기 완료",
      draws
    };
  }

  toggleEquipCompanion(id: string): ActionFeedback {
    const def = companionById.get(id);
    if (!def) return { ok: false, message: "존재하지 않는 동료입니다" };
    if (!this.isCompanionOwned(id)) return { ok: false, message: "미보유 동료입니다" };

    const index = this.state.equippedCompanionIds.indexOf(id);
    if (index >= 0) {
      this.state.equippedCompanionIds.splice(index, 1);
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
    const runtime = this.getCompanionRuntime(id);
    if (runtime.level <= 0 || runtime.level >= COMPANION_MAX_LEVEL) return 0;
    const base = COMPANION_LEVELUP_COST_START[def.tier];
    const growth = COMPANION_LEVELUP_COST_GROWTH[def.tier];
    return Math.max(1, floor(base * Math.pow(growth, runtime.level - 1)));
  }

  levelUpCompanion(id: string): ActionFeedback {
    const def = companionById.get(id);
    if (!def) return { ok: false, message: "존재하지 않는 동료입니다" };
    const runtime = this.getCompanionRuntime(id);
    if (runtime.level <= 0) return { ok: false, message: "미보유 동료입니다" };
    if (runtime.level >= COMPANION_MAX_LEVEL) return { ok: false, message: "이미 최대 레벨입니다" };

    const cost = this.companionLevelUpCost(id);
    if (runtime.shards < 1) return { ok: false, message: "동료 조각이 부족합니다" };
    if (this.state.diamonds < cost) return { ok: false, message: "다이아가 부족합니다" };

    this.state.diamonds -= cost;
    this.state.companionRuntime[id] = {
      level: runtime.level + 1,
      shards: runtime.shards - 1
    };

    return { ok: true, message: `${def.name} Lv${runtime.level + 1} 강화` };
  }

  getCompanionStatBreakdown() {
    const effects = this.companionEffectTotals();

    const attackBase = Math.max(1, floor(PLAYER_BASE_ATTACK * Math.pow(1 + UPGRADE_ATTACK.perLevelMultiplier, this.state.upgrades.attack)));
    const attackTotal = Math.max(1, floor(attackBase * (1 + effects.atk)));

    const hpBase = Math.max(1, floor(PLAYER_BASE_HP * Math.pow(1 + UPGRADE_HP.perLevelMultiplier, this.state.upgrades.hp)));
    const hpTotal = Math.max(1, floor(hpBase * (1 + effects.hp)));

    const speedBaseRaw = Math.min(
      UPGRADE_SPEED.cap,
      Math.max(PLAYER_BASE_ATTACK_SPEED, PLAYER_BASE_ATTACK_SPEED + UPGRADE_SPEED.perLevel * this.state.upgrades.speed)
    );
    const speedBase = Math.max(PLAYER_BASE_ATTACK_SPEED, Math.min(UPGRADE_SPEED.cap, speedBaseRaw));
    const speedTotal = Math.max(PLAYER_BASE_ATTACK_SPEED, Math.min(UPGRADE_SPEED.cap, speedBase * (1 + effects.speed)));

    const critChanceBase = clamp(0.01 * this.state.skills.critChance, 0, 1);
    const critChanceTotal = clamp(critChanceBase + effects.crit, 0, 1);

    const critDamageBase = clamp(0.5 + this.state.skills.critDamage * 0.12, 0, 10);
    const critDamageTotal = clamp(critDamageBase + effects.critDmg, 0, 10);

    const extraChanceBase = clamp(0.005 * this.state.skills.extraChance, 0, 0.5);
    const extraChanceTotal = clamp(extraChanceBase + effects.cleave, 0, 0.5);

    const lifestealChanceBase = clamp(0.005 * this.state.skills.lifestealChance, 0, 0.5);
    const lifestealChanceTotal = clamp(lifestealChanceBase + effects.lifesteal, 0, 0.5);

    const lifestealAmountBase = clamp(0.0025 * this.state.skills.lifestealAmount, 0, 0.2);
    const lifestealAmountTotal = lifestealAmountBase;

    return {
      attack: { base: attackBase, bonus: Math.max(0, attackTotal - attackBase), total: attackTotal },
      hp: { base: hpBase, bonus: Math.max(0, hpTotal - hpBase), total: hpTotal },
      speed: { base: speedBase, bonus: Math.max(0, speedTotal - speedBase), total: speedTotal },
      critChance: { base: critChanceBase, bonus: Math.max(0, critChanceTotal - critChanceBase), total: critChanceTotal },
      critDamage: { base: critDamageBase, bonus: Math.max(0, critDamageTotal - critDamageBase), total: critDamageTotal },
      extraChance: { base: extraChanceBase, bonus: Math.max(0, extraChanceTotal - extraChanceBase), total: extraChanceTotal },
      extraCount: { base: Math.floor(this.state.skills.extraCount / 5), bonus: 0, total: Math.floor(this.state.skills.extraCount / 5) },
      lifestealChance: { base: lifestealChanceBase, bonus: Math.max(0, lifestealChanceTotal - lifestealChanceBase), total: lifestealChanceTotal },
      lifestealAmount: { base: lifestealAmountBase, bonus: Math.max(0, lifestealAmountTotal - lifestealAmountBase), total: lifestealAmountTotal }
    };
  }
  getCompanionEffectSummaryText(): string {
    this.normalizeCompanionState();

    const ownedTotal = emptyEffect();
    const equippedTotal = emptyEffect();

    for (const def of COMPANIONS) {
      const runtime = this.getCompanionRuntime(def.id);
      if (runtime.level <= 0) continue;
      const ownedScale = effectScale(def.tier, runtime.level, "owned");
      addEffect(ownedTotal, def.ownedEffect, ownedScale);
    }

    for (const id of this.state.equippedCompanionIds) {
      const def = companionById.get(id);
      if (!def) continue;
      const runtime = this.getCompanionRuntime(id);
      if (runtime.level <= 0) continue;
      const equippedScale = effectScale(def.tier, runtime.level, "equipped");
      addEffect(equippedTotal, def.equippedEffect, equippedScale);
    }

    const toText = (effect: Required<CompanionEffect>): string => {
      const parts: string[] = [];
      if (effect.atk > 0) parts.push(`공격력 ${Math.round(effect.atk * 100)}%`);
      if (effect.hp > 0) parts.push(`체력 ${Math.round(effect.hp * 100)}%`);
      if (effect.speed > 0) parts.push(`공격속도 ${Math.round(effect.speed * 100)}%`);
      if (effect.crit > 0) parts.push(`치명타 확률 ${Math.round(effect.crit * 100)}%`);
      if (effect.critDmg > 0) parts.push(`치명타 데미지 ${Math.round(effect.critDmg * 100)}%`);
      if (effect.gold > 0) parts.push(`골드 획득 ${Math.round(effect.gold * 100)}%`);
      if (effect.lifesteal > 0) parts.push(`흡혈 확률 ${Math.round(effect.lifesteal * 100)}%`);
      if (effect.cleave > 0) parts.push(`추가타 확률 ${Math.round(effect.cleave * 100)}%`);
      return parts.length ? parts.join(", ") : "없음";
    };

    return `보유 효과: ${toText(ownedTotal)} / 장착 효과: ${toText(equippedTotal)}`;
  }
  serialize(): PersistedGameData {
    this.normalizeCompanionState();
    return {
      version: SAVE_VERSION,
      gold: Math.max(0, floor(this.state.gold)),
      diamonds: Math.max(0, floor(this.state.diamonds)),
      chapter: clamp(floor(this.state.chapter), 1, MAX_CHAPTER),
      stage: clamp(floor(this.state.stage), 1, MAX_STAGE),
      stageKillCount: clamp(floor(this.state.stageKillCount), 0, ENEMIES_PER_STAGE),
      level: Math.max(1, floor(this.state.level)),
      exp: Math.max(0, floor(this.state.exp)),
      heroHp: Math.max(0, floor(this.state.heroHp)),
      drawCount: Math.max(0, floor(this.state.drawCount)),
      upgrades: { ...this.state.upgrades },
      skills: { ...this.state.skills },
      equippedCompanionIds: [...this.state.equippedCompanionIds],
      companionRuntime: { ...this.state.companionRuntime }
    };
  }

  load(data: PersistedGameData): void {
    if (!data || typeof data !== "object") return;

    this.state.gold = Math.max(0, floor(data.gold ?? 0));
    this.state.diamonds = Math.max(0, floor(data.diamonds ?? 0));
    this.state.chapter = clamp(floor(data.chapter ?? 1), 1, MAX_CHAPTER);
    this.state.stage = clamp(floor(data.stage ?? 1), 1, MAX_STAGE);
    this.state.stageKillCount = clamp(floor(data.stageKillCount ?? 0), 0, ENEMIES_PER_STAGE);
    this.state.level = Math.max(1, floor(data.level ?? 1));
    this.state.exp = Math.max(0, floor(data.exp ?? 0));
    this.state.drawCount = Math.max(0, floor(data.drawCount ?? 0));

    this.state.upgrades.attack = Math.max(0, floor(data.upgrades?.attack ?? 0));
    this.state.upgrades.hp = Math.max(0, floor(data.upgrades?.hp ?? 0));
    this.state.upgrades.speed = Math.max(0, floor(data.upgrades?.speed ?? 0));

    this.state.skills.critChance = clamp(floor(data.skills?.critChance ?? 0), 0, SKILL_LIMIT.critChance);
    this.state.skills.critDamage = clamp(floor(data.skills?.critDamage ?? 0), 0, SKILL_LIMIT.critDamage);
    this.state.skills.extraChance = clamp(floor(data.skills?.extraChance ?? 0), 0, SKILL_LIMIT.extraChance);
    this.state.skills.extraCount = clamp(floor(data.skills?.extraCount ?? 0), 0, SKILL_LIMIT.extraCount);
    this.state.skills.lifestealChance = clamp(floor(data.skills?.lifestealChance ?? 0), 0, SKILL_LIMIT.lifestealChance);
    this.state.skills.lifestealAmount = clamp(floor(data.skills?.lifestealAmount ?? 0), 0, SKILL_LIMIT.lifestealAmount);

    this.state.companionRuntime = data.companionRuntime ?? {};
    this.state.equippedCompanionIds = Array.isArray(data.equippedCompanionIds) ? [...data.equippedCompanionIds] : [];
    this.normalizeCompanionState();

    this.state.heroHp = Math.max(0, floor(data.heroHp ?? this.getDerivedStats().maxHp));
    this.state.heroHp = Math.min(this.state.heroHp, this.getDerivedStats().maxHp);

    if (this.state.stageKillCount >= ENEMIES_PER_STAGE) {
      this.spawnMidBoss();
    } else {
      this.spawnNormalEnemy();
    }

    this.state.notice = null;
    this.state.transitionSecLeft = 0;
    this.bossTimeLeftEnsure();
  }

  private bossTimeLeftEnsure(): void {
    if (this.state.enemy.type === "normal") {
      this.state.bossTimeLeft = 0;
      return;
    }
    this.state.bossTimeLeft = clamp(this.state.bossTimeLeft || BOSS_TIME_LIMIT, 0, BOSS_TIME_LIMIT);
  }
}

