import type { CompanionDefinition, CompanionRole, CompanionTier } from "./types";

export const STORAGE_KEY = "auto-idle-modular-v1";
export const SAVE_VERSION = 1;

export const MAX_CHAPTER = 20;
export const MAX_STAGE = 20;
export const ENEMIES_PER_STAGE = 5;
export const BOSS_TIME_LIMIT = 10;

export const PLAYER_BASE_ATTACK = 20;
export const PLAYER_BASE_HP = 200;
export const PLAYER_BASE_ATTACK_SPEED = 1.0;

export const ENEMY_BASE_ATTACK = 8;
export const ENEMY_BASE_HP = 60;

export const ENEMY_ATK_GROWTH = { early: 1.07, mid: 1.09, late: 1.11 };
export const ENEMY_HP_GROWTH = { early: 1.13, mid: 1.16, late: 1.19 };

export const GOLD_BASE = 10;
export const GOLD_GROWTH = { early: 1.16, mid: 1.14, late: 1.13 };

export const MID_BOSS_MULTIPLIER = { atk: 1.35, hp: 2.5, gold: 3 };
export const CHAPTER_BOSS_GOLD_MULTIPLIER = 8;
export const CHAPTER_CLEAR_DIAMOND_REWARD = 10;

export const DIAMOND_DROP_CHANCE = 0.1;

export const UPGRADE_ATTACK = { baseCost: 50, growth: 1.12, perLevelMultiplier: 0.08 };
export const UPGRADE_HP = { baseCost: 40, growth: 1.11, perLevelMultiplier: 0.1 };
export const UPGRADE_SPEED = { baseCost: 120, growth: 1.14, perLevel: 0.08, cap: 10 };

export const SKILL_COST = {
  critChance: { baseCost: 150, growth: 1.15 },
  critDamage: { baseCost: 130, growth: 1.15 },
  extraChance: { baseCost: 200, growth: 1.16 },
  extraCount: { baseCost: 500, growth: 1.2 },
  lifestealChance: { baseCost: 180, growth: 1.15 },
  lifestealAmount: { baseCost: 160, growth: 1.14 }
};

export const SKILL_LIMIT = {
  critChance: 100,
  critDamage: 80,
  extraChance: 100,
  extraCount: 25,
  lifestealChance: 100,
  lifestealAmount: 80
};

export const COMPANION_DRAW_COST = { single: 10, multi11: 100, multiCount: 11 };
export const COMPANION_MAX_LEVEL = 10;

export const COMPANION_LEVELUP_COST_START: Record<CompanionTier, number> = {
  1: 50,
  2: 120,
  3: 300,
  4: 800
};

export const COMPANION_LEVELUP_COST_GROWTH: Record<CompanionTier, number> = {
  1: 1.1,
  2: 1.12,
  3: 1.14,
  4: 1.16
};

export const COMPANION_LEVELUP_EFFECT_GROWTH: Record<CompanionTier, { owned: number; equipped: number }> = {
  1: { owned: 0.06, equipped: 0.08 },
  2: { owned: 0.05, equipped: 0.07 },
  3: { owned: 0.04, equipped: 0.06 },
  4: { owned: 0.03, equipped: 0.05 }
};

export const COMPANION_TIER_RATE: Record<CompanionTier, number> = {
  1: 0.6,
  2: 0.28,
  3: 0.1,
  4: 0.02
};

export const ENEMY_FAMILIES = [
  {
    id: "slime",
    normal: "초원 슬라임",
    midboss: "늪지 거대 슬라임",
    chapterBoss: "심연 슬라임 군주",
    sprite: {
      normal: "/enemy/normal/normal_slime.png",
      midboss: "/enemy/midboss/mid_slime.png",
      chapterBoss: "/enemy/chapboss/chap_slime.png"
    }
  },
  {
    id: "hound",
    normal: "바위 하운드",
    midboss: "광폭 하운드 대장",
    chapterBoss: "월식 하운드 군주",
    sprite: {
      normal: "/enemy/normal/normal_rocky_hound.png",
      midboss: "/enemy/midboss/mid_hound.png",
      chapterBoss: "/enemy/chapboss/chap_hound.png"
    }
  },
  {
    id: "golem",
    normal: "암석 골렘",
    midboss: "중갑 골렘",
    chapterBoss: "고대 골렘 코어",
    sprite: {
      normal: "/enemy/normal/normal_rocky_golem.png",
      midboss: "/enemy/midboss/mid_golem.png",
      chapterBoss: "/enemy/chapboss/chap_golem.png"
    }
  },
  {
    id: "specter",
    normal: "망령 레이스",
    midboss: "비명 망령",
    chapterBoss: "무월 망령 군주",
    sprite: {
      normal: "/enemy/normal/normal_wraith.png",
      midboss: "/enemy/midboss/mid_wraith.png",
      chapterBoss: "/enemy/chapboss/chap_wraith.png"
    }
  },
  {
    id: "lizard",
    normal: "사막 도마뱀 전사",
    midboss: "모래 역습자 리자드",
    chapterBoss: "태사막 리자드 군주",
    sprite: {
      normal: "/enemy/normal/normal_desert_lizard.png",
      midboss: "/enemy/midboss/mid_lizard.png",
      chapterBoss: "/enemy/chapboss/chap_lizard.png"
    }
  },
  {
    id: "construct",
    normal: "자동병기 코어",
    midboss: "골든 집행기",
    chapterBoss: "프로토 오버시어",
    sprite: {
      normal: "/enemy/normal/normal_core.png",
      midboss: "/enemy/midboss/mid_core.png",
      chapterBoss: "/enemy/chapboss/chap_core.png"
    }
  }
] as const;

const ROLE_EFFECTS: Record<CompanionTier, Record<CompanionRole, { owned: Record<string, number>; equipped: Record<string, number> }>> = {
  1: {
    atk: { owned: { atk: 0.03 }, equipped: { atk: 0.15 } },
    hp: { owned: { hp: 0.03 }, equipped: { hp: 0.15 } },
    speed: { owned: { speed: 0.01 }, equipped: { speed: 0.06 } },
    crit: { owned: { crit: 0.01 }, equipped: { crit: 0.04 } },
    util: { owned: { gold: 0.03 }, equipped: { gold: 0.12 } }
  },
  2: {
    atk: { owned: { atk: 0.05 }, equipped: { atk: 0.25 } },
    hp: { owned: { hp: 0.05 }, equipped: { hp: 0.25 } },
    speed: { owned: { speed: 0.02 }, equipped: { speed: 0.1 } },
    crit: { owned: { crit: 0.02, critDmg: 0.1 }, equipped: { crit: 0.06, critDmg: 0.3 } },
    util: { owned: { gold: 0.05 }, equipped: { gold: 0.2 } }
  },
  3: {
    atk: { owned: { atk: 0.08 }, equipped: { atk: 0.4 } },
    hp: { owned: { hp: 0.08 }, equipped: { hp: 0.4 } },
    speed: { owned: { speed: 0.03 }, equipped: { speed: 0.15 } },
    crit: { owned: { crit: 0.03, critDmg: 0.2 }, equipped: { crit: 0.1, critDmg: 0.5 } },
    util: { owned: { gold: 0.08 }, equipped: { gold: 0.3 } }
  },
  4: {
    atk: { owned: { atk: 0.12 }, equipped: { atk: 0.6 } },
    hp: { owned: { hp: 0.12 }, equipped: { hp: 0.6 } },
    speed: { owned: { speed: 0.05 }, equipped: { speed: 0.2 } },
    crit: { owned: { crit: 0.05, critDmg: 0.35 }, equipped: { crit: 0.15, critDmg: 0.8 } },
    util: { owned: { gold: 0.12 }, equipped: { gold: 0.45 } }
  }
};

const COMPANION_NAMES: Record<CompanionTier, Record<CompanionRole, string>> = {
  1: {
    atk: "별무리 도우미",
    hp: "회복 버섯 정령",
    speed: "산들 바람새",
    crit: "달빛 궁수",
    util: "채굴 상인"
  },
  2: {
    atk: "불꽃 창기사",
    hp: "강철 수호병",
    speed: "질풍 항해사",
    crit: "은빛 저격수",
    util: "황금 수집가"
  },
  3: {
    atk: "천공 선봉대",
    hp: "심연 방패수",
    speed: "번개 추적자",
    crit: "그림자 검무사",
    util: "유산 탐사자"
  },
  4: {
    atk: "천공 대검왕",
    hp: "태고 수호신",
    speed: "폭풍 질주자",
    crit: "심연 감시인",
    util: "운명의 연금술사"
  }
};

const ROLE_ORDER: CompanionRole[] = ["atk", "hp", "speed", "crit", "util"];

export const COMPANIONS: CompanionDefinition[] = [1, 2, 3, 4].flatMap((tierNum) => {
  const tier = tierNum as CompanionTier;
  return ROLE_ORDER.map((role, idx) => {
    const base = ROLE_EFFECTS[tier][role];
    return {
      id: `comp-${tier}-${idx + 1}`,
      name: COMPANION_NAMES[tier][role],
      tier,
      role,
      ownedEffect: base.owned,
      equippedEffect: base.equipped
    } as CompanionDefinition;
  });
});

export function chapterBossMultiplier(chapter: number): { atk: number; hp: number } {
  if (chapter <= 4) return { atk: 1.8, hp: 5 };
  if (chapter === 5) return { atk: 2.2, hp: 10 };
  if (chapter <= 10) return { atk: 2.4, hp: 12 };
  return { atk: 2.8, hp: 15 };
}
