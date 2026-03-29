import { IdleGameEngine, type ActionFeedback } from "../core/engine";
import { getCombatSkillById, skillRarityText, skillValuesAtLevel } from "../core/skills";
import type { CompanionDefinition, CompanionEffect, CompanionShopItemView, CompanionTier, Notice, UpgradeKey } from "../core/types";
import { ProgressApiService, type RankingEntry, type RankingType } from "../services/progressApi";

type TabName = "status" | "upgrade" | "skill" | "companion";

interface TimedNotice {
  text: string;
  kind: Notice["kind"];
  remain: number;
}

export class GameApp {
  private readonly engine = new IdleGameEngine();
  private readonly progressApi = new ProgressApiService();

  private activeTab: TabName = "upgrade";
  private batchCount = 1;
  private uiNotice: TimedNotice | null = null;
  private selectedCompanionId: string | null = null;
  private selectedSkillId: string | null = null;
  private pendingShopItemId: string | null = null;

  private heroHpText!: HTMLElement;
  private enemyHpText!: HTMLElement;
  private heroHpBar!: HTMLElement;
  private enemyHpBar!: HTMLElement;
  private stageLabel!: HTMLElement;
  private stageProgressBar!: HTMLElement;
  private bossTimerText!: HTMLElement;
  private goldText!: HTMLElement;
  private diamondText!: HTMLElement;
  private powerText!: HTMLElement;
  private activeBuffText!: HTMLElement;
  private noticeText!: HTMLElement;
  private noticeTextInner!: HTMLElement;
  private enemyNameText!: HTMLElement;
  private enemySprite!: HTMLImageElement;

  private heroSpriteEl!: HTMLImageElement;
  private enemyWrapEl!: HTMLElement;
  private fadeOverlayEl!: HTMLElement;
  private fxSlashEl!: HTMLElement;
  private fxCritEl!: HTMLElement;
  private fxExtraEl!: HTMLElement;

  private statPanel!: HTMLElement;
  private upgradePanel!: HTMLElement;
  private skillPanel!: HTMLElement;
  private companionPanel!: HTMLElement;
  private authStatusText!: HTMLElement;
  private authLogoutBtn!: HTMLButtonElement;
  private powerRankingBtn!: HTMLButtonElement;
  private adminToolsBox!: HTMLElement;
  private adminAddGoldBtn!: HTMLButtonElement;
  private adminAddDiamondBtn!: HTMLButtonElement;

  private upgradeList!: HTMLElement;
  private upgradeBatchBtn!: HTMLButtonElement;
  private upgradeSummaryText!: HTMLElement;

  private skillSlotText!: HTMLElement;
  private skillEquippedText!: HTMLElement;
  private skillList!: HTMLElement;
  private skillEquippedSlots!: HTMLElement;
  private skillDetailName!: HTMLElement;
  private skillDetailMeta!: HTMLElement;
  private skillDetailDesc!: HTMLElement;
  private skillDetailVals!: HTMLElement;
  private clearSkillEquipBtn!: HTMLButtonElement;

  private drawResultText!: HTMLElement;
  private companionList!: HTMLElement;
  private companionEquippedSlots!: HTMLElement;
  private companionSlotText!: HTMLElement;
  private companionOwnedEffectText!: HTMLElement;
  private companionEquippedEffectText!: HTMLElement;
  private companionEffectText!: HTMLElement;
  private drawCountText!: HTMLElement;
  private companionCoinText!: HTMLElement;
  private companionCoinBoostText!: HTMLElement;
  private companionGrowthTicketText!: HTMLElement;
  private companionShopList!: HTMLElement;
  private openCompanionShopBtn!: HTMLButtonElement;

  private companionDetailName!: HTMLElement;
  private companionDetailTier!: HTMLElement;
  private companionDetailMeta!: HTMLElement;
  private companionDetailOwned!: HTMLElement;
  private companionDetailEquipped!: HTMLElement;
  private companionEquipBtn!: HTMLButtonElement;
  private companionLevelBtn!: HTMLButtonElement;

  private drawModal!: HTMLElement;
  private drawModalCards!: HTMLElement;
  private drawModalTitle!: HTMLElement;
  private companionShopModal!: HTMLElement;
  private closeCompanionShopModalBtn!: HTMLButtonElement;
  private fragmentSelectModal!: HTMLElement;
  private fragmentSelectTitle!: HTMLElement;
  private fragmentSelectList!: HTMLElement;
  private rankingModal!: HTMLElement;
  private rankingList!: HTMLElement;
  private rankingModePowerBtn!: HTMLButtonElement;
  private rankingModeStageBtn!: HTMLButtonElement;
  private rankingMode: RankingType = "power";

  private prevHeroHp = 0;
  private prevEnemyHp = 0;
  private upgradeListHtmlCache = "";
  private skillListHtmlCache = "";
  private companionListHtmlCache = "";
  private skillEquippedSlotsHtmlCache = "";
  private companionEquippedSlotsHtmlCache = "";
  private companionShopListHtmlCache = "";

  constructor(private readonly mountNode: HTMLElement) {}

  mount(): void {
    this.mountNode.innerHTML = this.template();
    this.bindElements();
    this.bindEvents();
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      const cloudPayload = this.progressApi.isAuthenticated() ? await this.progressApi.load() : null;
      if (cloudPayload) {
        try {
          this.engine.load(cloudPayload);
          this.pushNotice("계정 데이터를 불러왔습니다", "success");
        } catch {
          this.pushNotice("저장 데이터가 손상되어 기본 상태로 시작합니다", "danger");
        }
      }
    } catch {
      this.pushNotice("계정 데이터 로드 실패: 기본 상태로 시작합니다", "danger");
    }

    setInterval(() => {
      if (!this.progressApi.isAuthenticated()) return;
      const payload = this.engine.serialize();
      const power = this.engine.getDerivedStats().combatPower;
      void this.progressApi.save(payload, power);
    }, 60000);

    this.render();
    this.prevHeroHp = this.engine.state.heroHp;
    this.prevEnemyHp = this.engine.state.enemy.hp;

    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      this.engine.tick(dt);
      this.tickNotice(dt);
      this.render();
      requestAnimationFrame(loop);
  };

    requestAnimationFrame(loop);
  }

  private bindElements(): void {
    const q = <T extends HTMLElement>(selector: string): T => {
      const el = this.mountNode.querySelector(selector) as T | null;
      if (!el) throw new Error(`element not found: ${selector}`);
      return el;
    };

    this.heroHpText = q("#heroHpText");
    this.enemyHpText = q("#enemyHpText");
    this.heroHpBar = q("#heroHpBar");
    this.enemyHpBar = q("#enemyHpBar");
    this.stageLabel = q("#stageLabel");
    this.stageProgressBar = q("#stageProgressBar");
    this.bossTimerText = q("#bossTimerText");
    this.goldText = q("#goldText");
    this.diamondText = q("#diamondText");
    this.powerText = q("#powerText");
    this.activeBuffText = q("#activeBuffText");
    this.noticeText = q("#noticeText");
    this.noticeTextInner = q("#noticeTextInner");
    this.enemyNameText = q("#enemyNameText");
    this.enemySprite = q<HTMLImageElement>("#enemySprite");

    this.heroSpriteEl = q<HTMLImageElement>("#heroSpriteEl");
    this.enemyWrapEl = q("#enemyWrapEl");
    this.fadeOverlayEl = q("#fadeOverlayEl");
    this.fxSlashEl = q("#fxSlashEl");
    this.fxCritEl = q("#fxCritEl");
    this.fxExtraEl = q("#fxExtraEl");

    this.statPanel = q("#panel-status");
    this.upgradePanel = q("#panel-upgrade");
    this.skillPanel = q("#panel-skill");
    this.companionPanel = q("#panel-companion");
    this.authStatusText = q("#authStatusText");
    this.authLogoutBtn = q<HTMLButtonElement>("#authLogoutBtn");
    this.powerRankingBtn = q<HTMLButtonElement>("#powerRankingBtn");
    this.adminToolsBox = q("#adminToolsBox");
    this.adminAddGoldBtn = q<HTMLButtonElement>("#adminAddGoldBtn");
    this.adminAddDiamondBtn = q<HTMLButtonElement>("#adminAddDiamondBtn");

    this.upgradeList = q("#upgradeList");
    this.upgradeBatchBtn = q<HTMLButtonElement>("#batchToggleBtn");
    this.upgradeSummaryText = q("#upgradeSummaryText");

    this.skillSlotText = q("#skillSlotText");
    this.skillEquippedText = q("#skillEquippedText");
    this.skillList = q("#skillList");
    this.skillEquippedSlots = q("#skillEquippedSlots");
    this.skillDetailName = q("#skillDetailName");
    this.skillDetailMeta = q("#skillDetailMeta");
    this.skillDetailDesc = q("#skillDetailDesc");
    this.skillDetailVals = q("#skillDetailVals");
    this.clearSkillEquipBtn = q<HTMLButtonElement>("#clearSkillEquipBtn");

    this.drawResultText = q("#drawResultText");
    this.companionList = q("#companionList");
    this.companionEquippedSlots = q("#companionEquippedSlots");
    this.companionSlotText = q("#companionSlotText");
    this.companionOwnedEffectText = q("#companionOwnedEffectText");
    this.companionEquippedEffectText = q("#companionEquippedEffectText");
    this.companionEffectText = q("#companionEffectText");
    this.drawCountText = q("#drawCountText");
    this.companionCoinText = q("#companionCoinText");
    this.companionCoinBoostText = q("#companionCoinBoostText");
    this.companionGrowthTicketText = q("#companionGrowthTicketText");
    this.companionShopList = q("#companionShopList");
    this.openCompanionShopBtn = q<HTMLButtonElement>("#openCompanionShopBtn");

    this.companionDetailName = q("#compDetailName");
    this.companionDetailTier = q("#compDetailTier");
    this.companionDetailMeta = q("#compDetailMeta");
    this.companionDetailOwned = q("#compDetailOwned");
    this.companionDetailEquipped = q("#compDetailEquipped");
    this.companionEquipBtn = q<HTMLButtonElement>("#compEquipBtn");
    this.companionLevelBtn = q<HTMLButtonElement>("#compLevelBtn");

    this.drawModal = q("#drawModal");
    this.drawModalCards = q("#drawModalCards");
    this.drawModalTitle = q("#drawModalTitle");
    this.companionShopModal = q("#companionShopModal");
    this.closeCompanionShopModalBtn = q<HTMLButtonElement>("#closeCompanionShopModalBtn");
    this.fragmentSelectModal = q("#fragmentSelectModal");
    this.fragmentSelectTitle = q("#fragmentSelectTitle");
    this.fragmentSelectList = q("#fragmentSelectList");
    this.rankingModal = q("#rankingModal");
    this.rankingList = q("#rankingList");
    this.rankingModePowerBtn = q<HTMLButtonElement>("#rankingModePowerBtn");
    this.rankingModeStageBtn = q<HTMLButtonElement>("#rankingModeStageBtn");
  }

  private bindEvents(): void {
    const bindTab = (name: TabName) => {
      this.mountNode.querySelector<HTMLButtonElement>(`button[data-tab='${name}']`)?.addEventListener("click", () => {
        this.activeTab = name;
        this.renderTabs();
      });
    };

    bindTab("status");
    bindTab("upgrade");
    bindTab("skill");
    bindTab("companion");

    this.upgradeBatchBtn.addEventListener("click", () => this.cycleBatchCount());

    this.upgradeList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest<HTMLButtonElement>("button[data-upgrade]");
      if (!btn) return;
      const key = btn.dataset.upgrade as UpgradeKey | undefined;
      if (!key) return;
      this.handleFeedback(this.engine.upgradeStat(key, this.batchCount));
    });

    this.skillList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const actionBtn = target.closest<HTMLButtonElement>("button[data-skill-action][data-skill-id]");
      if (actionBtn) {
        const id = actionBtn.dataset.skillId;
        const action = actionBtn.dataset.skillAction;
        if (!id || !action) return;

        if (action === "unlock") this.handleFeedback(this.engine.unlockCombatSkill(id));
        if (action === "upgrade") this.handleFeedback(this.engine.upgradeCombatSkill(id));
        if (action === "equip") this.handleFeedback(this.engine.toggleEquipCombatSkill(id));
        this.selectedSkillId = id;
        return;
      }

      const card = target.closest<HTMLElement>(".skill-card[data-skill-id]");
      if (!card) return;
      const id = card.dataset.skillId;
      if (!id) return;
      this.selectedSkillId = id;
      this.renderSkillPanel();
    });

    this.skillEquippedSlots.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const actionBtn = target.closest<HTMLButtonElement>("button[data-skill-slot-action][data-skill-id]");
      if (actionBtn) {
        const id = actionBtn.dataset.skillId;
        const action = actionBtn.dataset.skillSlotAction;
        if (!id || !action) return;
        if (action === "unequip") this.handleFeedback(this.engine.toggleEquipCombatSkill(id));
        this.selectedSkillId = id;
        return;
      }

      const card = target.closest<HTMLElement>(".equip-slot-card[data-skill-id]");
      if (!card) return;
      const id = card.dataset.skillId;
      if (!id) return;
      this.selectedSkillId = id;
      this.renderSkillPanel();
    });
    this.clearSkillEquipBtn.addEventListener("click", () => this.handleFeedback(this.engine.clearEquippedSkills()));

    this.mountNode.querySelector<HTMLButtonElement>("#drawSingleBtn")?.addEventListener("click", () => this.handleFeedback(this.engine.drawCompanions(1)));
    this.mountNode.querySelector<HTMLButtonElement>("#drawMultiBtn")?.addEventListener("click", () => this.handleFeedback(this.engine.drawCompanions(11)));
    this.mountNode.querySelector<HTMLButtonElement>("#clearEquipBtn")?.addEventListener("click", () => this.handleFeedback(this.engine.clearEquippedCompanions()));

    this.mountNode.querySelector<HTMLButtonElement>("#closeDrawModalBtn")?.addEventListener("click", () => this.hideDrawModal());
    this.mountNode.querySelector<HTMLButtonElement>("#closeFragmentSelectModalBtn")?.addEventListener("click", () => this.hideFragmentSelectModal());
    this.drawModal.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.dataset.action === "close-draw") this.hideDrawModal();
    });
    this.openCompanionShopBtn.addEventListener("click", () => this.openCompanionShopModal());
    this.closeCompanionShopModalBtn.addEventListener("click", () => this.closeCompanionShopModal());
    this.companionShopModal.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.dataset.action === "close-companion-shop") this.closeCompanionShopModal();
    });
    this.mountNode.querySelector<HTMLButtonElement>("#closeRankingModalBtn")?.addEventListener("click", () => this.closeRankingModal());
    this.mountNode.querySelector<HTMLButtonElement>("#refreshRankingBtn")?.addEventListener("click", () => void this.openRankingModal(true));
    this.rankingModePowerBtn.addEventListener("click", () => { this.rankingMode = "power"; void this.openRankingModal(true); });
    this.rankingModeStageBtn.addEventListener("click", () => { this.rankingMode = "stage"; void this.openRankingModal(true); });
    this.rankingModal.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.dataset.action === "close-ranking") this.closeRankingModal();
    });

    this.mountNode.querySelector<HTMLButtonElement>("#cloudSaveBtn")?.addEventListener("click", async () => {
      if (!this.progressApi.isAuthenticated()) { this.pushNotice("로그인 후 사용 가능합니다", "info"); return; }
      const ok = await this.progressApi.save(this.engine.serialize(), this.engine.getDerivedStats().combatPower);
      this.pushNotice(ok ? "계정 저장 완료" : "계정 저장 실패", ok ? "success" : "danger");
    });

    this.mountNode.querySelector<HTMLButtonElement>("#cloudLoadBtn")?.addEventListener("click", async () => {
      if (!this.progressApi.isAuthenticated()) { this.pushNotice("로그인 후 사용 가능합니다", "info"); return; }
      const payload = await this.progressApi.load();
      if (!payload) { this.pushNotice("계정 저장 데이터가 없습니다", "info"); return; }
      this.engine.load(payload);
      this.pushNotice("계정 데이터 불러오기 완료", "success");
    });

    this.mountNode.querySelector<HTMLButtonElement>("#authManageBtn")?.addEventListener("click", () => {
      const session = this.progressApi.getSession();
      this.pushNotice(session ? `현재 계정: ${session.user.username}` : "미로그인 상태", "info");
    });

    this.powerRankingBtn.addEventListener("click", () => void this.openRankingModal(true));

    this.authLogoutBtn.addEventListener("click", async () => {
      const session = this.progressApi.getSession();
      if (!session) {
        this.pushNotice("로그인 상태가 아닙니다", "info");
        return;
      }

      const shouldLogout = window.confirm(`현재 계정: ${session.user.username}\\n로그아웃 하시겠습니까?`);
      if (!shouldLogout) return;

      await this.progressApi.logout();
      window.location.reload();
    });

    this.adminAddGoldBtn.addEventListener("click", () => {
      if (!this.isAdmin()) {
        this.pushNotice("admin 계정만 사용 가능합니다", "danger");
        return;
      }
      this.engine.state.gold += 100000;
      this.pushNotice("[admin] 골드 +100000", "success");
    });

    this.adminAddDiamondBtn.addEventListener("click", () => {
      if (!this.isAdmin()) {
        this.pushNotice("admin 계정만 사용 가능합니다", "danger");
        return;
      }
      this.engine.state.diamonds += 1000;
      this.pushNotice("[admin] 다이아 +1000", "success");
    });

    this.companionList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest<HTMLElement>(".companion-card[data-id]");
      if (!card) return;
      const id = card.dataset.id;
      if (!id) return;
      this.selectedCompanionId = id;
      this.renderCompanionPanel();
    });

    this.companionEquippedSlots.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const actionBtn = target.closest<HTMLButtonElement>("button[data-comp-slot-action][data-comp-id]");
      if (actionBtn) {
        const id = actionBtn.dataset.compId;
        const action = actionBtn.dataset.compSlotAction;
        if (!id || !action) return;
        if (action === "unequip") this.handleFeedback(this.engine.toggleEquipCompanion(id));
        this.selectedCompanionId = id;
        return;
      }

      const card = target.closest<HTMLElement>(".equip-slot-card[data-comp-id]");
      if (!card) return;
      const id = card.dataset.compId;
      if (!id) return;
      this.selectedCompanionId = id;
      this.renderCompanionPanel();
    });
    this.companionEquipBtn.addEventListener("click", () => {
      if (!this.selectedCompanionId) return;
      this.handleFeedback(this.engine.toggleEquipCompanion(this.selectedCompanionId));
    });

    this.companionLevelBtn.addEventListener("click", () => {
      if (!this.selectedCompanionId) return;
      this.handleFeedback(this.engine.levelUpCompanion(this.selectedCompanionId));
    });

    this.companionShopList.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : (event.target as Node | null)?.parentElement;
      if (!target) return;
      const btn = target.closest<HTMLButtonElement>("button[data-shop-buy]");
      if (!btn) return;

      const blockedReason = btn.dataset.shopBlockedReason;
      if (blockedReason) {
        this.handleFeedback({ ok: false, message: blockedReason });
        return;
      }

      const itemId = btn.dataset.shopBuy;
      const tier = btn.dataset.shopTier ? Number(btn.dataset.shopTier) : 0;
      if (!itemId) return;

      if (tier >= 1 && tier <= 4) {
        this.openFragmentSelectModal(itemId, tier as CompanionTier);
        return;
      }

      this.handleFeedback(this.engine.purchaseCompanionShopItem(itemId));
    });

    this.fragmentSelectList.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : (event.target as Node | null)?.parentElement;
      if (!target) return;
      const btn = target.closest<HTMLButtonElement>("button[data-select-companion-id]");
      if (!btn) return;
      const companionId = btn.dataset.selectCompanionId;
      if (!companionId || !this.pendingShopItemId) return;
      this.handleFeedback(this.engine.purchaseCompanionShopItem(this.pendingShopItemId, companionId));
      this.selectedCompanionId = companionId;
      this.hideFragmentSelectModal();
    });
  }
  private cycleBatchCount(): void {
    if (this.batchCount === 1) this.batchCount = 5;
    else if (this.batchCount === 5) this.batchCount = 10;
    else this.batchCount = 1;
    this.render();
  }

  private handleFeedback(feedback: ActionFeedback): void {
    this.pushNotice(feedback.message, feedback.ok ? "success" : "danger");
    if (feedback.draws?.length) {
      const preview = feedback.draws.slice(0, 4).map((v) => {
        if (v.isNew) return `${v.name} 획득`;
        return v.coinGain && v.coinGain > 0 ? `${v.name} 중복→코인(+${this.formatCompact(v.coinGain)})` : `${v.name} 중복→조각`;
      }).join(" / ");
      this.drawResultText.textContent = `${feedback.draws.length}개 결과: ${preview}${feedback.draws.length > 4 ? " ..." : ""}`;
      this.showDrawModal(feedback.draws);
    }
  }

  private pushNotice(text: string, kind: Notice["kind"]): void { this.uiNotice = { text, kind, remain: 1.6 }; }
  private tickNotice(dt: number): void { if (!this.uiNotice) return; this.uiNotice.remain -= dt; if (this.uiNotice.remain <= 0) this.uiNotice = null; }

  private triggerElementFx(el: HTMLElement, className: string, durationMs: number): void {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    window.setTimeout(() => el.classList.remove(className), durationMs);
  }

  private triggerBattleFx(kind: "slash" | "crit" | "extra"): void {
    if (kind === "slash") this.triggerElementFx(this.fxSlashEl, "show", 240);
    if (kind === "crit") this.triggerElementFx(this.fxCritEl, "show", 320);
    if (kind === "extra") this.triggerElementFx(this.fxExtraEl, "show", 320);
  }

  private renderBattleMotion(): void {
    const state = this.engine.state;
    const derived = this.engine.getDerivedStats();

    if (this.prevEnemyHp > state.enemy.hp) {
      const delta = this.prevEnemyHp - state.enemy.hp;
      this.triggerElementFx(this.heroSpriteEl, "attack", 220);
      this.triggerElementFx(this.enemyWrapEl, "hit", 240);
      this.triggerBattleFx("slash");
      if (delta >= derived.attack * 1.45) this.triggerBattleFx("crit");
      if (delta >= derived.attack * 1.9 && derived.extraCount > 0) this.triggerBattleFx("extra");
    }

    if (this.prevHeroHp > state.heroHp) {
      this.triggerElementFx(this.enemyWrapEl, "attack", 220);
      this.triggerElementFx(this.heroSpriteEl, "hit", 240);
    }

    if (this.prevEnemyHp > 0 && state.enemy.hp <= 0) this.triggerElementFx(this.enemyWrapEl, "dead", 720);
    if (this.prevHeroHp > 0 && state.heroHp <= 0) this.triggerElementFx(this.heroSpriteEl, "dead", 720);

    if (state.transitionSecLeft > 0) {
      const progress = 1 - Math.min(1, state.transitionSecLeft / 1);
      const opacity = Math.sin(progress * Math.PI) * 0.62;
      this.fadeOverlayEl.style.opacity = opacity.toFixed(3);
    } else this.fadeOverlayEl.style.opacity = "0";

    this.prevHeroHp = state.heroHp;
    this.prevEnemyHp = state.enemy.hp;
  }

  private render(): void {
    const state = this.engine.state;
    const derived = this.engine.getDerivedStats();

    this.heroHpText.textContent = `${this.formatCompact(Math.floor(state.heroHp))} / ${this.formatCompact(derived.maxHp)}`;
    this.enemyHpText.textContent = `${this.formatCompact(Math.floor(state.enemy.hp))} / ${this.formatCompact(state.enemy.hpMax)}`;

    this.heroHpBar.style.width = `${Math.max(0, Math.min(1, state.heroHp / Math.max(1, derived.maxHp))) * 100}%`;
    this.enemyHpBar.style.width = `${Math.max(0, Math.min(1, state.enemy.hp / Math.max(1, state.enemy.hpMax))) * 100}%`;

    this.stageLabel.textContent = this.engine.getStageLabel();
    this.stageProgressBar.style.width = `${Math.max(0, Math.min(100, this.engine.getStageProgressRate() * 100))}%`;
    this.bossTimerText.textContent = state.enemy.type === "normal" ? "-" : `${Math.max(0, Math.ceil(state.bossTimeLeft))}초`;

    this.goldText.textContent = this.formatCompact(state.gold);
    this.diamondText.textContent = this.formatCompact(state.diamonds);
    this.powerText.textContent = this.formatCompact(derived.combatPower);
    this.enemyNameText.textContent = state.enemy.name;
    this.enemySprite.src = state.enemy.spritePath;

    const equippedSkills = this.engine.getCombatSkillsDisplay().filter((v) => v.unlocked && v.equipped);
    if (equippedSkills.length <= 0) {
      this.activeBuffText.innerHTML = `<div class="buff-empty">장착 스킬 없음</div>`;
    } else {
      this.activeBuffText.innerHTML = equippedSkills.map((v) => {
        const rt = this.engine.state.skillRuntime[v.id];
        const isActive = !!rt?.active && (rt?.durationRemain ?? 0) > 0;
        const cooldownRemain = Math.max(0, rt?.cooldownRemain ?? 0);
        const durationRemain = Math.max(0, rt?.durationRemain ?? 0);

        let stateClass = "ready";
        let stateText = "대기";
        let timeText = "READY";
        let progress = 1;

        if (isActive) {
          stateClass = "active";
          stateText = "활성";
          timeText = `${this.formatFixed2(durationRemain)}s`;
          progress = v.durationSec > 0 ? Math.max(0, Math.min(1, durationRemain / v.durationSec)) : 1;
        } else if (cooldownRemain > 0) {
          stateClass = "cooldown";
          stateText = "쿨타임";
          timeText = `${this.formatFixed2(cooldownRemain)}s`;
          progress = v.cooldownSec > 0 ? Math.max(0, Math.min(1, 1 - (cooldownRemain / v.cooldownSec))) : 0;
        }

        return `
          <article class="buff-card ${stateClass}">
            <div class="buff-card-head">
              <strong>${v.name}</strong>
              <span class="buff-state ${stateClass}">${stateText}</span>
            </div>
            <div class="buff-time">${timeText}</div>
            <div class="buff-bar"><div class="buff-fill ${stateClass}" style="width:${Math.round(progress * 100)}%"></div></div>
          </article>
        `;
      }).join("");
    }

    this.renderBattleMotion();

    const notice = state.notice ?? this.uiNotice;
    if (notice) {
      this.noticeText.classList.add("show");
      this.noticeText.classList.remove("info", "success", "danger");
      this.noticeText.classList.add(notice.kind);
      this.noticeTextInner.textContent = notice.text;
    } else {
      this.noticeText.classList.remove("show", "info", "success", "danger");
      this.noticeTextInner.textContent = "";
    }

    this.renderTabs();
    this.renderStatusPanel();
    this.renderUpgradePanel();
    this.renderSkillPanel();
    this.renderCompanionPanel();
  }

  private isAdmin(): boolean {
    const session = this.progressApi.getSession();
    return session?.user?.username === "admin";
  }

  private renderTabs(): void {
    const map: Record<TabName, HTMLElement> = {
      status: this.statPanel,
      upgrade: this.upgradePanel,
      skill: this.skillPanel,
      companion: this.companionPanel
    };

    (Object.keys(map) as TabName[]).forEach((name) => {
      map[name].classList.toggle("active", this.activeTab === name);
      this.mountNode.querySelector(`button[data-tab='${name}']`)?.classList.toggle("active", this.activeTab === name);
    });
  }

  private renderStatusPanel(): void {
    const state = this.engine.state;
    const derived = this.engine.getDerivedStats();
    const breakdown = this.engine.getCompanionStatBreakdown();

    const setText = (id: string, value: string): void => {
      const el = this.mountNode.querySelector<HTMLElement>(id);
      if (el) el.textContent = value;
    };

    const f = (n: number) => this.formatCompact(n);
    const fp = (n: number) => `${this.formatCompact(n * 100)}%`;

    setText("#statStage", this.engine.getStageLabel());
    setText("#statLevel", `${state.level}`);
    setText("#statExp", `${f(state.exp)} / ${f(this.expNeed(state.level))}`);
    setText("#statAttack", `${f(breakdown.attack.total)} (${f(breakdown.attack.base)} + ${f(breakdown.attack.bonus)})`);
    setText("#statHp", `${f(breakdown.hp.total)} (${f(breakdown.hp.base)} + ${f(breakdown.hp.bonus)})`);
    setText("#statSpeed", `${this.formatFixed2(breakdown.speed.total)}회/초 (${this.formatFixed2(breakdown.speed.base)} + ${this.formatFixed2(breakdown.speed.bonus)})`);
    setText("#statDps", f(derived.expectedDps));
    setText("#statCrit", `치확 ${fp(breakdown.critChance.total)} (${fp(breakdown.critChance.base)} + ${fp(breakdown.critChance.bonus)}) / 치피 ${fp(breakdown.critDamage.total)} (${fp(breakdown.critDamage.base)} + ${fp(breakdown.critDamage.bonus)})`);
    setText("#statExtra", `확률 ${fp(breakdown.extraChance.total)} (${fp(breakdown.extraChance.base)} + ${fp(breakdown.extraChance.bonus)}) / ${f(breakdown.extraCount.total)}회`);
    setText("#statLife", `확률 ${fp(breakdown.lifestealChance.total)} (${fp(breakdown.lifestealChance.base)} + ${fp(breakdown.lifestealChance.bonus)}) / 회복 ${fp(breakdown.lifestealAmount.total)} (${fp(breakdown.lifestealAmount.base)} + ${fp(breakdown.lifestealAmount.bonus)})`);
    setText("#statPower", f(derived.combatPower));
    const session = this.progressApi.getSession();
    this.authStatusText.textContent = session ? `계정: ${session.user.username}` : "계정: 미로그인";
    this.authLogoutBtn.disabled = !session;

    const admin = this.isAdmin();
    this.adminToolsBox.style.display = admin ? "flex" : "none";
    this.adminAddGoldBtn.disabled = !admin;
    this.adminAddDiamondBtn.disabled = !admin;
  }

  private renderUpgradePanel(): void {
    const items = this.engine.getUpgradeDisplay(this.batchCount);
    this.upgradeBatchBtn.textContent = `x${this.batchCount}`;

    const listHtml = items
      .map((v) => {
        const notEnoughGold = !v.done && this.engine.state.gold < v.cost;
        const disabled = v.done || notEnoughGold;
        const cost = v.done ? "MAX" : this.formatCompact(v.cost);
        const currentText = (v.key === "attack" || v.key === "hp") ? `${this.formatCompact(parseFloat(v.currentText))}%` : v.currentText;
        const nextText = (v.key === "attack" || v.key === "hp") ? `${this.formatCompact(parseFloat(v.nextText))}%` : v.nextText;
        return `
          <button data-upgrade="${v.key}" ${disabled ? "disabled" : ""}>
            ${v.label}
            <small>Lv ${v.level} · 현재 ${currentText} · 다음 ${nextText}</small>
            <span>${cost}${v.done ? "" : ` (${v.count}회)`}${notEnoughGold ? " · 골드 부족" : ""}</span>
          </button>
        `;
      })
      .join("");
    if (this.upgradeListHtmlCache !== listHtml) {
      this.upgradeListHtmlCache = listHtml;
      this.upgradeList.innerHTML = listHtml;
    }

    this.upgradeSummaryText.textContent = `골드 ${this.formatCompact(this.engine.state.gold)} · 배치 x${this.batchCount}`;
  }

  private skillTypeText(type: string): string {
    if (type === "attack") return "공격형";
    if (type === "crit") return "치명형";
    if (type === "survival") return "생존형";
    if (type === "utility") return "수급형";
    return "혼합형";
  }

  private triggerText(type: string): string {
    if (type === "auto_interval") return "자동 주기";
    if (type === "boss_start") return "보스 시작";
    if (type === "low_hp") return "저체력";
    if (type === "on_kill") return "처치 시";
    return "치명 피해";
  }

  private skillValueSummary(id: string, level: number): string {
    const def = getCombatSkillById(id);
    if (!def || level <= 0) return "-";
    const val = skillValuesAtLevel(def, level);
    const parts: string[] = [];
    if (val.attackRate > 0) parts.push(`공격 +${this.formatCompact(val.attackRate * 100)}%`);
    if (val.attackSpeedRate > 0) parts.push(`공속 +${this.formatCompact(val.attackSpeedRate * 100)}%`);
    if (val.critChance > 0) parts.push(`치확 +${this.formatCompact(val.critChance * 100)}%`);
    if (val.critDamage > 0) parts.push(`치피 +${this.formatCompact(val.critDamage * 100)}%`);
    if (val.extraHitRate > 0) parts.push(`추가타 확률 +${this.formatCompact(val.extraHitRate * 100)}%`);
    if (val.lifestealAmount > 0) parts.push(`흡혈량 +${this.formatCompact(val.lifestealAmount * 100)}%`);
    if (val.damageReduction > 0) parts.push(`피해감소 ${this.formatCompact(val.damageReduction * 100)}%`);
    if (val.healMaxHpInstant > 0) parts.push(`즉시회복 ${this.formatCompact(val.healMaxHpInstant * 100)}%`);
    if (val.lethalHealMaxHp > 0) parts.push(`부활회복 ${this.formatCompact(val.lethalHealMaxHp * 100)}%`);
    if (val.goldGain > 0) parts.push(`골드 +${this.formatCompact(val.goldGain * 100)}%`);
    if (val.killReward > 0) parts.push(`처치보상 +${this.formatCompact(val.killReward * 100)}%`);
    return parts.join(", ") || "효과 없음";
  }

  private renderSkillPanel(): void {
    const items = this.engine.getCombatSkillsDisplay();
    if (!this.selectedSkillId || !items.some((v) => v.id === this.selectedSkillId)) {
      this.selectedSkillId = items[0]?.id ?? null;
    }

    this.skillSlotText.textContent = `${this.engine.state.equippedSkillIds.length} / ${this.engine.state.skillSlotsUnlocked}`;
    this.skillEquippedText.textContent = this.engine.state.equippedSkillIds
      .map((id) => items.find((v) => v.id === id)?.name ?? id)
      .join(" / ") || "없음";
    const skillSlotHtml = Array.from({ length: this.engine.state.skillSlotsUnlocked }, (_, idx) => {
      const id = this.engine.state.equippedSkillIds[idx];
      if (!id) {
        return `<article class="equip-slot-card empty"><header><strong>빈 슬롯 ${idx + 1}</strong></header><p>장착된 스킬 없음</p></article>`;
      }
      const v = items.find((x) => x.id === id);
      if (!v) {
        return `<article class="equip-slot-card empty"><header><strong>빈 슬롯 ${idx + 1}</strong></header><p>장착된 스킬 없음</p></article>`;
      }
      const tier = v.rarity === "legendary" ? 4 : v.rarity === "epic" ? 3 : v.rarity === "rare" ? 2 : 1;
      return `
        <article class="equip-slot-card ${this.selectedSkillId === v.id ? "selected" : ""}" data-skill-id="${v.id}">
          <header>
            <strong>${v.name}</strong>
            <span class="tier-badge tier-${tier}">${skillRarityText(v.rarity)}</span>
          </header>
          <p>Lv ${v.level}/${v.maxLevel}</p>
          <div class="row-btns"><button data-skill-slot-action="unequip" data-skill-id="${v.id}">장착 해제</button></div>
        </article>
      `;
    }).join("");
    if (this.skillEquippedSlotsHtmlCache !== skillSlotHtml) {
      this.skillEquippedSlotsHtmlCache = skillSlotHtml;
      this.skillEquippedSlots.innerHTML = skillSlotHtml;
    }

    const listHtml = items
      .map((v) => {
        const stateText = !v.unlocked ? "잠금" : v.equipped ? "장착" : "보유";
        const actionBtn = !v.unlocked
          ? `<button data-skill-action="unlock" data-skill-id="${v.id}">해금 (${this.formatCompact(v.unlockCost)} 다이아)</button>`
          : v.level >= v.maxLevel
            ? `<button data-skill-action="upgrade" data-skill-id="${v.id}" disabled>강화 완료</button>`
            : `<button data-skill-action="upgrade" data-skill-id="${v.id}">강화 (${this.formatCompact(v.upgradeCost)} 다이아)</button>`;

        const equipBtn = v.unlocked
          ? `<button data-skill-action="equip" data-skill-id="${v.id}">${v.equipped ? "장착 해제" : "장착"}</button>`
          : "";

        return `
          <article class="companion-card skill-card ${this.selectedSkillId === v.id ? "selected" : ""}" data-skill-id="${v.id}">
            <header>
              <strong>${v.name}</strong>
              <div class="card-badges"><span class="tier-badge tier-${v.rarity === "legendary" ? 4 : v.rarity === "epic" ? 3 : v.rarity === "rare" ? 2 : 1}">${skillRarityText(v.rarity)}</span></div>
            </header>
            <p>${this.skillTypeText(v.type)} · ${this.triggerText(v.triggerType)} · ${stateText}</p>
            <p>Lv ${v.level}/${v.maxLevel}</p>
            <div class="row-btns">${actionBtn}${equipBtn}</div>
          </article>
        `;
      })
      .join("");
    if (this.skillListHtmlCache !== listHtml) {
      this.skillListHtmlCache = listHtml;
      this.skillList.innerHTML = listHtml;
    }

    const selected = items.find((v) => v.id === this.selectedSkillId);
    if (!selected) return;

    this.skillDetailName.textContent = selected.name;
    this.skillDetailMeta.textContent = `${skillRarityText(selected.rarity)} · ${this.skillTypeText(selected.type)} · 쿨 ${selected.cooldownSec}s / 지속 ${selected.durationSec}s`;
    this.skillDetailDesc.textContent = selected.description;

    const cur = this.skillValueSummary(selected.id, Math.max(1, selected.level));
    const nxt = selected.level < selected.maxLevel ? this.skillValueSummary(selected.id, selected.level + 1) : "MAX";
    this.skillDetailVals.textContent = `현재: ${cur} / 다음: ${nxt}`;
  }

  private renderCompanionPanel(): void {
    const state = this.engine.state;
    const companions = this.engine.getCompanions();

    if (!this.selectedCompanionId || !companions.some((c) => c.id === this.selectedCompanionId)) {
      const firstOwned = companions.find((c) => this.engine.getCompanionRuntime(c.id).level > 0);
      this.selectedCompanionId = (firstOwned ?? companions[0] ?? null)?.id ?? null;
    }

    this.companionSlotText.textContent = `${state.equippedCompanionIds.length} / ${this.engine.getUnlockedCompanionSlots()}`;
    const companionSummary = this.engine.getCompanionEffectSummarySplitText();
    this.companionOwnedEffectText.textContent = companionSummary.owned;
    this.companionEquippedEffectText.textContent = companionSummary.equipped;
    this.companionEffectText.textContent = `총 적용: ${companionSummary.total}`;
    this.drawCountText.textContent = this.formatCompact(state.drawCount);
    this.companionCoinText.textContent = this.formatCompact(this.engine.getCompanionCoins());
    this.companionCoinBoostText.textContent = this.engine.getCompanionCoinBoostText();
    this.companionGrowthTicketText.textContent = this.formatCompact(this.engine.getCompanionGrowthTickets());

    this.mountNode.querySelector<HTMLButtonElement>("#drawSingleBtn")!.disabled = state.diamonds < 10;
    this.mountNode.querySelector<HTMLButtonElement>("#drawMultiBtn")!.disabled = state.diamonds < 100;
    const companionSlotHtml = Array.from({ length: this.engine.getUnlockedCompanionSlots() }, (_, idx) => {
      const id = state.equippedCompanionIds[idx];
      if (!id) {
        return `<article class="equip-slot-card empty"><header><strong>빈 슬롯 ${idx + 1}</strong></header><p>장착된 동료 없음</p></article>`;
      }
      const def = companions.find((x) => x.id === id);
      if (!def) {
        return `<article class="equip-slot-card empty"><header><strong>빈 슬롯 ${idx + 1}</strong></header><p>장착된 동료 없음</p></article>`;
      }
      const rt = this.engine.getCompanionRuntime(def.id);
      return `
        <article class="equip-slot-card tier-${def.tier} ${this.selectedCompanionId === def.id ? "selected" : ""}" data-comp-id="${def.id}">
          <header>
            <strong>${def.name}</strong>
            <span class="tier-badge tier-${def.tier}">T${def.tier}</span>
          </header>
          <p>${this.companionRoleText(def.role)} · Lv ${this.formatCompact(rt.level)} · 조각 ${this.formatCompact(rt.shards)}</p>
          <div class="row-btns"><button data-comp-slot-action="unequip" data-comp-id="${def.id}">장착 해제</button></div>
        </article>
      `;
    }).join("");
    if (this.companionEquippedSlotsHtmlCache !== companionSlotHtml) {
      this.companionEquippedSlotsHtmlCache = companionSlotHtml;
      this.companionEquippedSlots.innerHTML = companionSlotHtml;
    }

    const listHtml = companions
      .map((def) => {
        const rt = this.engine.getCompanionRuntime(def.id);
        const owned = rt.level > 0;
        const equipped = state.equippedCompanionIds.includes(def.id);
        return `
          <article class="companion-card tier-${def.tier} ${this.selectedCompanionId === def.id ? "selected" : ""}" data-id="${def.id}">
            <header>
              <strong>${def.name}</strong>
              <div class="card-badges"><span class="tier-badge tier-${def.tier}">T${def.tier}</span></div>
            </header>
            <p>${this.companionRoleText(def.role)} · Lv ${this.formatCompact(rt.level)} · 조각 ${this.formatCompact(rt.shards)} · ${!owned ? "미획득" : equipped ? "장착" : "보유"}</p>
          </article>
        `;
      })
      .join("");
    if (this.companionListHtmlCache !== listHtml) {
      this.companionListHtmlCache = listHtml;
      this.companionList.innerHTML = listHtml;
    }

    const shopItems = this.engine.getCompanionShopDisplay();
    const shopHtml = shopItems.map((item) => {
      const tier = item.rewardValue.tier ?? 0;
      const isSelector = item.rewardType === "tier_fragment_selector";
      const blockedAttr = item.buyBlockedReason ? `data-shop-blocked-reason="${item.buyBlockedReason}"` : "";
      const disabledClass = !item.buyable ? "class=\"disabled\"" : "";
      const reason = item.buyBlockedReason ? `<small class="muted">${item.buyBlockedReason}</small>` : `<small class="muted">구매 가능</small>`;
      const unlockLine = `<small class="muted">해금: ${item.unlockText}</small>`;
      const desc = this.shopItemDescription(item);
      return `
        <article class="shop-item-card ${item.buyable ? "" : "blocked"}">
          <header><strong>${item.name}</strong><span>가격: ${this.formatCompact(item.price)} 코인</span></header>
          <p class="muted">${desc}</p>
          <p class="muted">남은 횟수: ${this.shopLimitText(item)}</p>
          ${unlockLine}
          ${reason}
          <div class="row-btns">
            <button data-shop-buy="${item.id}" ${isSelector ? `data-shop-tier="${tier}"` : ""} ${blockedAttr} ${disabledClass}>구매</button>
          </div>
        </article>
      `;
    }).join("");
    if (this.companionShopListHtmlCache !== shopHtml) {
      this.companionShopListHtmlCache = shopHtml;
      this.companionShopList.innerHTML = shopHtml;
    }

    if (!this.selectedCompanionId) return;
    const def = companions.find((v) => v.id === this.selectedCompanionId);
    if (!def) return;

    const rt = this.engine.getCompanionRuntime(def.id);
    const owned = rt.level > 0;
    const equipped = state.equippedCompanionIds.includes(def.id);
    const levelCost = this.engine.companionLevelUpCost(def.id);
    const detail = this.engine.getCompanionDetailDisplay(def.id);
    if (!detail) return;

    this.companionDetailName.textContent = def.name;
    this.companionDetailTier.textContent = `T${def.tier}`;
    this.companionDetailTier.className = `tier-badge tier-${def.tier}`;
    this.companionDetailMeta.textContent = `${detail.roleText} · 레벨 ${this.formatCompact(rt.level)} · 조각 ${this.formatCompact(rt.shards)} · ${owned ? "보유" : "미보유"} · ${equipped ? "장착" : "미장착"}`;

    const ownedBaseText = this.effectToText(detail.ownedCurrent);
    const equippedBaseText = this.effectToText(detail.equippedCurrent);

    if (detail.nextLevel && detail.ownedNext && detail.ownedDelta) {
      this.companionDetailOwned.textContent = `보유 효과: ${ownedBaseText} → Lv${detail.nextLevel} ${this.effectToText(detail.ownedNext)} (증가 ${this.effectToText(detail.ownedDelta)})`;
    } else {
      this.companionDetailOwned.textContent = `보유 효과: ${ownedBaseText}${owned ? " (최대 레벨)" : " (획득 시 적용)"}`;
    }

    if (detail.nextLevel && detail.equippedNext && detail.equippedDelta) {
      this.companionDetailEquipped.textContent = `장착 효과: ${equippedBaseText} → Lv${detail.nextLevel} ${this.effectToText(detail.equippedNext)} (증가 ${this.effectToText(detail.equippedDelta)})`;
    } else {
      this.companionDetailEquipped.textContent = `장착 효과: ${equippedBaseText}${owned ? " (최대 레벨)" : " (획득 시 적용)"}`;
    }

    this.companionEquipBtn.textContent = equipped ? "장착 해제" : "장착";
    this.companionEquipBtn.disabled = !owned;

    const needShard = detail.fragmentsNeed ?? 0;
    const hasTicket = this.engine.getCompanionGrowthTickets() > 0;

    if (!owned) {
      this.companionLevelBtn.textContent = "강화 불가";
      this.companionLevelBtn.disabled = true;
    } else if (rt.level >= 10 || levelCost <= 0) {
      this.companionLevelBtn.textContent = "강화 완료";
      this.companionLevelBtn.disabled = true;
    } else {
      this.companionLevelBtn.textContent = `강화 (${this.formatCompact(levelCost)} 다이아 + 조각 ${this.formatCompact(needShard)}${hasTicket ? " 또는 촉진제 1" : ""})`;
      this.companionLevelBtn.disabled = (!hasTicket && rt.shards < needShard) || state.diamonds < levelCost;
    }
  }

  private openCompanionShopModal(): void {
    this.companionShopModal.classList.add("show");
    this.companionShopModal.setAttribute("aria-hidden", "false");
  }

  private closeCompanionShopModal(): void {
    this.companionShopModal.classList.remove("show");
    this.companionShopModal.setAttribute("aria-hidden", "true");
  }
  private openFragmentSelectModal(itemId: string, tier: CompanionTier): void {
    this.pendingShopItemId = itemId;
    const choices = this.engine.getCompanionChoicesByTier(tier);
    this.fragmentSelectTitle.textContent = `T${tier} 선택 조각 대상 선택`;
    this.fragmentSelectList.innerHTML = choices.map((c) => `
      <button type="button" data-select-companion-id="${c.id}">
        <span>${c.name}</span>
        <small>${this.companionRoleText(c.role)}</small>
      </button>
    `).join("");
    this.fragmentSelectModal.classList.add("show");
    this.fragmentSelectModal.setAttribute("aria-hidden", "false");
  }

  private hideFragmentSelectModal(): void {
    this.pendingShopItemId = null;
    this.fragmentSelectModal.classList.remove("show");
    this.fragmentSelectModal.setAttribute("aria-hidden", "true");
  }


  private shopItemDescription(item: CompanionShopItemView): string {
    if (item.rewardType === "tier_fragment_selector") {
      const tier = item.rewardValue.tier ?? 0;
      const amount = item.rewardValue.amount ?? 1;
      return `T${tier} 동료를 선택해 조각 ${this.formatCompact(amount)}개를 획득합니다.`;
    }
    if (item.rewardType === "tier_fragment_random") {
      const tier = item.rewardValue.tier ?? 0;
      const amount = item.rewardValue.amount ?? 1;
      return `T${tier} 동료 중 랜덤으로 조각 ${this.formatCompact(amount)}개를 획득합니다.`;
    }
    if (item.rewardType === "gold_boost_small" || item.rewardType === "gold_boost_medium") {
      const rate = Math.round((item.rewardValue.goldBoostRate ?? 0) * 100);
      const mins = Math.max(0, Math.floor((item.rewardValue.durationSec ?? 0) / 60));
      return `${mins}분 동안 골드 획득량 +${rate}% (중첩 불가, 재구매 시 시간 갱신).`;
    }
    if (item.rewardType === "companion_growth_ticket") {
      const amount = item.rewardValue.amount ?? 1;
      return `동료 강화 시 조각 대신 사용할 수 있는 성장 촉진제 ${this.formatCompact(amount)}개를 지급합니다.`;
    }
    return "구매 시 즉시 적용되는 상점 아이템입니다.";
  }
  private shopLimitText(item: CompanionShopItemView): string {
    const parts: string[] = [];
    if (item.dailyLimit !== null && item.dailyRemain !== null) parts.push(`일 ${item.dailyRemain}/${item.dailyLimit}`);
    if (item.weeklyLimit !== null && item.weeklyRemain !== null) parts.push(`주 ${item.weeklyRemain}/${item.weeklyLimit}`);
    return parts.length > 0 ? parts.join(" · ") : "제한 없음";
  }
  private companionRoleText(role: CompanionDefinition["role"]): string {
    if (role === "atk") return "공격형";
    if (role === "hp") return "방어형";
    if (role === "speed") return "공속형";
    if (role === "crit") return "치명형";
    return "유틸형";
  }

  private effectToText(effect: CompanionEffect): string {
    const parts: string[] = [];
    if (effect.atk) parts.push(`공격력 +${this.formatCompact(effect.atk * 100)}%`);
    if (effect.finalAtk) parts.push(`최종공격력 +${this.formatCompact(effect.finalAtk * 100)}%`);
    if (effect.hp) parts.push(`체력 +${this.formatCompact(effect.hp * 100)}%`);
    if (effect.speed) parts.push(`공격속도 +${this.formatCompact(effect.speed * 100)}%`);
    if (effect.crit) parts.push(`치확 +${this.formatCompact(effect.crit * 100)}%p`);
    if (effect.critDmg) parts.push(`치피 +${this.formatCompact(effect.critDmg * 100)}%p`);
    if (effect.gold) parts.push(`골드 +${this.formatCompact(effect.gold * 100)}%`);
    if (effect.lifesteal) parts.push(`흡혈 +${this.formatCompact(effect.lifesteal * 100)}%`);
    if (effect.cleave) parts.push(`추가타 +${this.formatCompact(effect.cleave * 100)}%`);
    return parts.length > 0 ? parts.join(", ") : "효과 없음";
  }

  private showDrawModal(draws: NonNullable<ActionFeedback["draws"]>): void {
    this.drawModalTitle.textContent = draws.length >= 11 ? "11연 동료 뽑기" : "동료 뽑기 결과";
    this.drawModalCards.innerHTML = draws
      .map((v, idx) => `
        <article class="draw-card tier-${v.tier} ${v.isNew ? "new" : "dup"}" style="animation-delay:${idx * 50}ms">
          <header><span class="tier-badge tier-${v.tier}">T${v.tier}</span><strong>${v.name}</strong></header>
          <p>${v.isNew ? "신규 획득" : (v.coinGain && v.coinGain > 0 ? `중복 획득 → 코인 +${this.formatCompact(v.coinGain)}` : "중복 획득 → 조각 지급")}</p>
          <small>Lv ${this.formatCompact(v.level)} · 조각 ${this.formatCompact(v.shards)}</small>
        </article>
      `)
      .join("");
    this.drawModal.classList.add("show");
    this.drawModal.setAttribute("aria-hidden", "false");
  }

  private hideDrawModal(): void {
    this.drawModal.classList.remove("show");
    this.drawModal.setAttribute("aria-hidden", "true");
  }

  private formatRankingTime(raw: string | null): string {
    if (!raw) return "-";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  private stageLabelFromIndex(stageIndex: number): string {
    const idx = Math.max(1, Math.floor(stageIndex));
    const chapter = Math.floor((idx - 1) / 20) + 1;
    const stage = ((idx - 1) % 20) + 1;
    return `${chapter}-${stage}`;
  }

  private rankingRow(entry: RankingEntry): string {
    const stageText = this.stageLabelFromIndex(entry.maxStageIndex);
    if (this.rankingMode === "stage") {
      return `
        <article class="ranking-row">
          <strong class="ranking-rank">#${entry.rank}</strong>
          <span class="ranking-name">${entry.playerName}</span>
          <span class="ranking-power">${stageText}</span>
          <span class="ranking-time">${this.formatCompact(entry.combatPower)}</span>
        </article>
      `;
    }

    return `
      <article class="ranking-row">
        <strong class="ranking-rank">#${entry.rank}</strong>
        <span class="ranking-name">${entry.playerName}</span>
        <span class="ranking-power">${this.formatCompact(entry.combatPower)}</span>
        <span class="ranking-time">${stageText}</span>
      </article>
    `;
  }

  private async openRankingModal(forceRefresh = false): Promise<void> {
    this.rankingModal.classList.add("show");
    this.rankingModal.setAttribute("aria-hidden", "false");

    this.rankingModePowerBtn.classList.toggle("active", this.rankingMode === "power");
    this.rankingModeStageBtn.classList.toggle("active", this.rankingMode === "stage");

    if (!forceRefresh && this.rankingList.childElementCount > 0) return;
    this.rankingList.innerHTML = `<p class="muted">랭킹 데이터를 불러오는 중...</p>`;

    const ranking = await this.progressApi.getRanking(this.rankingMode, 30);
    if (!ranking.length) {
      this.rankingList.innerHTML = `<p class="muted">랭킹 데이터가 없습니다. 계정 저장 후 다시 확인해 주세요.</p>`;
      return;
    }

    const head = this.rankingMode === "power"
      ? `<article class="ranking-row ranking-head"><strong class="ranking-rank">순위</strong><span class="ranking-name">이름</span><span class="ranking-power">전투력</span><span class="ranking-time">최대 스테이지</span></article>`
      : `<article class="ranking-row ranking-head"><strong class="ranking-rank">순위</strong><span class="ranking-name">이름</span><span class="ranking-power">최대 스테이지</span><span class="ranking-time">전투력</span></article>`;

    this.rankingList.innerHTML = head + ranking.map((v) => this.rankingRow(v)).join("");
  }

  private closeRankingModal(): void {
    this.rankingModal.classList.remove("show");
    this.rankingModal.setAttribute("aria-hidden", "true");
  }

  private formatFixed2(value: number): string {
    if (!Number.isFinite(value)) return "0";
    const rounded = Math.round(value * 100) / 100;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return `${Math.round(rounded)}`;
    return rounded.toFixed(2).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }

  private formatFixed3(value: number): string {
    if (!Number.isFinite(value)) return "0";
    const rounded = Math.round(value * 1000) / 1000;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return `${Math.round(rounded)}`;
    return rounded.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }

  private compactUnit(index: number): string {
    if (index <= 0) return "";
    const letters = "abcdefghijklmnopqrstuvwxyz";
    let n = index;
    let out = "";
    while (n > 0) {
      n -= 1;
      out = letters[n % 26] + out;
      n = Math.floor(n / 26);
    }
    return out;
  }

  private formatCompact(value: number): string {
    if (!Number.isFinite(value)) return "0";
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    if (abs < 1000) return `${sign}${this.formatFixed3(abs)}`;
    const tier = Math.floor(Math.log10(abs) / 3);
    const scaled = abs / Math.pow(1000, tier);
    return `${sign}${this.formatFixed3(scaled)}${this.compactUnit(tier)}`;
  }

  private expNeed(level: number): number { return Math.floor(12 * Math.pow(1.5, Math.max(0, level - 1))); }

  private template(): string {
    return `
      <div class="game-root" id="gameRoot">
        <section class="card header-card">
          <h1>자동전투 강화 Idle (TypeScript 모듈판)</h1>
          <p>강화/스킬/동료 시스템을 분리 적용했습니다.</p>
        </section>

        <section class="card battle-card">
          <div class="battle-top">
            <div class="hp-line">
              <div class="hp-box"><span>내 체력</span><strong id="heroHpText">0 / 0</strong><div class="bar"><div id="heroHpBar" class="fill hero"></div></div></div>
              <div class="hp-divider"></div>
              <div class="hp-box"><span>적 체력</span><strong id="enemyHpText">0 / 0</strong><div class="bar"><div id="enemyHpBar" class="fill enemy"></div></div></div>
            </div>
            <div class="stage-row"><span>현재 스테이지</span><strong id="stageLabel">1-1</strong></div>
            <div class="bar small"><div id="stageProgressBar" class="fill stage"></div></div>
            <div class="chip-row">
              <span class="chip">전투력 <strong id="powerText">0</strong></span>
              <span class="chip gold">골드 <strong id="goldText">0</strong></span>
              <span class="chip dia">다이아 <strong id="diamondText">0</strong></span>
              <span class="chip">보스 제한시간 <strong id="bossTimerText">-</strong></span>
            </div>
            <div id="activeBuffText" class="active-buff-panel"><div class="buff-empty">장착 스킬 없음</div></div>
          </div>

          <div class="battle-stage" id="battleStageEl">
            <img id="heroSpriteEl" class="hero-sprite" src="/warrior/warrior.png" alt="hero" />
            <div class="enemy-wrap" id="enemyWrapEl">
              <div id="enemyNameText" class="enemy-name">적</div>
              <img id="enemySprite" class="enemy-sprite" src="/enemy/normal/normal_slime.png" alt="enemy" />
            </div>
            <div id="fxSlashEl" class="battle-fx slash"></div>
            <div id="fxCritEl" class="battle-fx crit"></div>
            <div id="fxExtraEl" class="battle-fx extra"></div>
            <div id="fadeOverlayEl" class="fade-overlay"></div>
            <div id="noticeText" class="notice"><span id="noticeTextInner"></span></div>
          </div>
        </section>

        <section class="card panel-card">
          <div class="tabs">
            <button data-tab="status">스텟</button>
            <button data-tab="upgrade" class="active">강화</button>
            <button data-tab="skill">스킬</button>
            <button data-tab="companion">동료</button>
          </div>

          <div id="panel-status" class="panel">
            <h2>전투 상태</h2>
            <div class="grid two">
              <div><span>스테이지</span><strong id="statStage">1-1</strong></div><div><span>레벨</span><strong id="statLevel">1</strong></div>
              <div><span>경험치</span><strong id="statExp">0</strong></div><div><span>공격력</span><strong id="statAttack">0</strong></div>
              <div><span>최대 체력</span><strong id="statHp">0</strong></div><div><span>공격속도</span><strong id="statSpeed">0</strong></div>
              <div><span>DPS</span><strong id="statDps">0</strong></div><div><span>치확/치피</span><strong id="statCrit">0</strong></div>
              <div><span>추가타</span><strong id="statExtra">0</strong></div><div><span>흡혈</span><strong id="statLife">0</strong></div>
              <div><span>전투력</span><strong id="statPower">0</strong></div>
            </div>
            <div class="row-btns"><button id="cloudSaveBtn">계정 저장</button><button id="cloudLoadBtn">계정 불러오기</button><button id="authManageBtn">계정 정보</button><button id="powerRankingBtn">랭킹</button><button id="authLogoutBtn">로그아웃</button></div><p id="authStatusText" class="muted">계정: 미로그인</p><div id="adminToolsBox" class="row-btns admin-tools" style="display:none;"><button id="adminAddGoldBtn">[admin] 골드 +100000</button><button id="adminAddDiamondBtn">[admin] 다이아 +1000</button></div>
          </div>

          <div id="panel-upgrade" class="panel active">
            <h2>강화 (골드)</h2>
            <div class="row-btns"><button id="batchToggleBtn">x1</button></div>
            <div id="upgradeList" class="grid one"></div>
            <p id="upgradeSummaryText" class="muted"></p>
          </div>

          <div id="panel-skill" class="panel">
            <h2>스킬 (다이아)</h2>
            <div class="row top-info"><span>장착 슬롯 <strong id="skillSlotText">0 / 0</strong></span><span>장착 스킬 <strong id="skillEquippedText">없음</strong></span></div>
            <p class="muted">슬롯 해금 조건: 기본 1칸 · 3챕터 클리어 2칸 · 7챕터 클리어 3칸</p>
            <div class="equip-slot-wrap">
              <div class="equip-slot-head"><strong>장착 스킬 슬롯</strong><span class="muted">카드 클릭: 상세 확인</span></div>
              <div id="skillEquippedSlots" class="equip-slot-grid"></div>
            </div>
            <div class="row-btns"><button id="clearSkillEquipBtn">스킬 전체 해제</button></div>

            <div class="companion-detail">
              <div class="detail-head"><strong id="skillDetailName">-</strong><span id="skillDetailMeta" class="muted">-</span></div>
              <p id="skillDetailDesc" class="muted">-</p>
              <p id="skillDetailVals" class="muted">-</p>
            </div>

            <div id="skillList" class="companion-list"></div>
          </div>

          <div id="panel-companion" class="panel">
            <h2>동료</h2>
            <div class="row-btns"><button id="drawSingleBtn">1회 뽑기 (10)</button><button id="drawMultiBtn">11회 뽑기 (100)</button><button id="openCompanionShopBtn">동료 코인 상점</button><button id="clearEquipBtn">장착 전체 해제</button></div>
            <p id="drawResultText" class="muted"></p>

            <div class="row top-info"><span>동료 코인 <strong id="companionCoinText">0</strong></span><span>성장 촉진제 <strong id="companionGrowthTicketText">0</strong></span></div>
            <p class="muted companion-boost-line">골드 부스터: <strong id="companionCoinBoostText">없음</strong></p>
            <div class="companion-summary-inline muted">
              <span>보유 누적 <strong id="companionOwnedEffectText">없음</strong></span>
              <span>장착 합산 <strong id="companionEquippedEffectText">없음</strong></span>
              <span id="companionEffectText">총 적용: 없음</span>
            </div>

            <div class="row top-info"><span>장착 슬롯 <strong id="companionSlotText">0 / 0</strong></span><span>총 뽑기 <strong id="drawCountText">0</strong></span></div>
            <p class="muted">슬롯 해금 조건: 기본 1칸 · 3챕터 클리어 2칸 · 7챕터 클리어 3칸</p>
            <div class="equip-slot-wrap">
              <div class="equip-slot-head"><strong>장착 동료 슬롯</strong><span class="muted">카드 클릭: 상세 확인</span></div>
              <div id="companionEquippedSlots" class="equip-slot-grid"></div>
            </div>

            <div class="companion-detail" id="companionDetailBox">
              <div class="detail-head"><strong id="compDetailName">-</strong><span id="compDetailTier" class="tier-badge tier-1">T1</span></div>
              <p id="compDetailMeta" class="muted">-</p>
              <p id="compDetailOwned" class="muted">보유 효과: -</p>
              <p id="compDetailEquipped" class="muted">장착 효과: -</p>
              <div class="row-btns comp-actions"><button id="compEquipBtn">장착</button><button id="compLevelBtn">강화</button></div>
            </div>

            <div id="companionList" class="companion-list"></div>
          </div>
        </section>

        <div id="drawModal" class="draw-modal" aria-hidden="true">
          <div class="draw-modal-backdrop" data-action="close-draw"></div>
          <div class="draw-modal-sheet">
            <div class="draw-modal-head"><strong id="drawModalTitle">동료 뽑기 결과</strong><button id="closeDrawModalBtn" type="button">닫기</button></div>
            <div id="drawModalCards" class="draw-cards"></div>
          </div>
        </div>

        <div id="companionShopModal" class="draw-modal" aria-hidden="true">
          <div class="draw-modal-backdrop" data-action="close-companion-shop"></div>
          <div class="draw-modal-sheet companion-shop-sheet">
            <div class="draw-modal-head"><strong>동료 코인 상점</strong><button id="closeCompanionShopModalBtn" type="button">닫기</button></div>
            <div id="companionShopList" class="shop-list"></div>
          </div>
        </div>

        <div id="fragmentSelectModal" class="draw-modal" aria-hidden="true">
          <div class="draw-modal-backdrop" data-action="close-fragment-select"></div>
          <div class="draw-modal-sheet fragment-select-sheet">
            <div class="draw-modal-head"><strong id="fragmentSelectTitle">조각 선택</strong><button id="closeFragmentSelectModalBtn" type="button">닫기</button></div>
            <div id="fragmentSelectList" class="fragment-select-list"></div>
          </div>
        </div>

        <div id="rankingModal" class="draw-modal" aria-hidden="true">
          <div class="draw-modal-backdrop" data-action="close-ranking"></div>
          <div class="draw-modal-sheet ranking-modal-sheet">
            <div class="draw-modal-head">
              <strong>랭킹</strong>
              <div class="ranking-head-actions">
                <button id="rankingModePowerBtn" type="button">전투력</button>
                <button id="rankingModeStageBtn" type="button">최대 스테이지</button>
                <button id="refreshRankingBtn" type="button">새로고침</button>
                <button id="closeRankingModalBtn" type="button">닫기</button>
              </div>
            </div>
            <div id="rankingList" class="ranking-list"></div>
          </div>
        </div>
      </div>
    `;
  }
}









































































