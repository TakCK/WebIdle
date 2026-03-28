
import { IdleGameEngine, type ActionFeedback } from "../core/engine";
import type { CompanionDefinition, CompanionEffect, Notice } from "../core/types";
import { LocalStorageService } from "../services/storage";
import { ProgressApiService } from "../services/progressApi";

type TabName = "status" | "upgrade" | "skill" | "companion";
type SkillKey = Parameters<IdleGameEngine["upgradeSkill"]>[0];

interface TimedNotice {
  text: string;
  kind: Notice["kind"];
  remain: number;
}

export class GameApp {
  private readonly engine = new IdleGameEngine();
  private readonly localStorage = new LocalStorageService(this.engine.getStorageKey());
  private readonly progressApi = new ProgressApiService("local-player");

  private activeTab: TabName = "upgrade";
  private batchCount = 1;
  private uiNotice: TimedNotice | null = null;
  private selectedCompanionId: string | null = null;

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

  private attackCostText!: HTMLElement;
  private hpCostText!: HTMLElement;
  private speedCostText!: HTMLElement;
  private attackValueText!: HTMLElement;
  private hpValueText!: HTMLElement;
  private speedValueText!: HTMLElement;
  private upgradeSummaryText!: HTMLElement;

  private skillCostEls!: Record<SkillKey, HTMLElement>;
  private skillDescEls!: Record<SkillKey, HTMLElement>;

  private drawResultText!: HTMLElement;
  private companionList!: HTMLElement;
  private companionSlotText!: HTMLElement;
  private companionEffectText!: HTMLElement;
  private companionEffectEquippedText!: HTMLElement;
  private drawCountText!: HTMLElement;

  private companionDetailName!: HTMLElement;
  private companionDetailTier!: HTMLElement;
  private companionDetailMeta!: HTMLElement;
  private companionDetailOwned!: HTMLElement;
  private companionDetailEquipped!: HTMLElement;
  private companionEquipBtn!: HTMLButtonElement;
  private companionLevelBtn!: HTMLButtonElement;
  private companionListHtmlCache = "";

  private drawModal!: HTMLElement;
  private drawModalCards!: HTMLElement;
  private drawModalTitle!: HTMLElement;

  private prevHeroHp = 0;
  private prevEnemyHp = 0;

  constructor(private readonly mountNode: HTMLElement) {}

  mount(): void {
    this.mountNode.innerHTML = this.template();
    this.bindElements();
    this.bindEvents();

    const saved = this.localStorage.load();
    if (saved) {
      this.engine.load(saved);
      this.pushNotice("로컬 저장 데이터를 불러왔습니다", "success");
    }

    setInterval(() => {
      this.localStorage.save(this.engine.serialize());
    }, 3000);

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

    this.attackCostText = q("#attackCostText");
    this.hpCostText = q("#hpCostText");
    this.speedCostText = q("#speedCostText");
    this.attackValueText = q("#attackValueText");
    this.hpValueText = q("#hpValueText");
    this.speedValueText = q("#speedValueText");
    this.upgradeSummaryText = q("#upgradeSummaryText");

    this.skillCostEls = {
      critChance: q("#skillCost-critChance"),
      critDamage: q("#skillCost-critDamage"),
      extraChance: q("#skillCost-extraChance"),
      extraCount: q("#skillCost-extraCount"),
      lifestealChance: q("#skillCost-lifestealChance"),
      lifestealAmount: q("#skillCost-lifestealAmount")
    };

    this.skillDescEls = {
      critChance: q("#skillDesc-critChance"),
      critDamage: q("#skillDesc-critDamage"),
      extraChance: q("#skillDesc-extraChance"),
      extraCount: q("#skillDesc-extraCount"),
      lifestealChance: q("#skillDesc-lifestealChance"),
      lifestealAmount: q("#skillDesc-lifestealAmount")
    };

    this.drawResultText = q("#drawResultText");
    this.companionList = q("#companionList");
    this.companionSlotText = q("#companionSlotText");
    this.companionEffectText = q("#companionEffectText");
    this.companionEffectEquippedText = q("#companionEquippedEffectText");
    this.drawCountText = q("#drawCountText");

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
  }

  private bindEvents(): void {
    const bindTab = (name: TabName) => {
      const button = this.mountNode.querySelector<HTMLButtonElement>(`button[data-tab='${name}']`);
      button?.addEventListener("click", () => {
        this.activeTab = name;
        this.renderTabs();
      });
    };

    bindTab("status");
    bindTab("upgrade");
    bindTab("skill");
    bindTab("companion");

    this.mountNode.querySelector<HTMLButtonElement>("#batchToggleBtn")?.addEventListener("click", () => this.cycleBatchCount());
    this.mountNode.querySelector<HTMLButtonElement>("#skillBatchToggleBtn")?.addEventListener("click", () => this.cycleBatchCount());

    this.mountNode.querySelector<HTMLButtonElement>("#upgradeAttackBtn")?.addEventListener("click", () => this.handleFeedback(this.engine.upgradeAttack(this.batchCount)));
    this.mountNode.querySelector<HTMLButtonElement>("#upgradeHpBtn")?.addEventListener("click", () => this.handleFeedback(this.engine.upgradeHp(this.batchCount)));
    this.mountNode.querySelector<HTMLButtonElement>("#upgradeSpeedBtn")?.addEventListener("click", () => this.handleFeedback(this.engine.upgradeSpeed(this.batchCount)));

    const skillButtons: Array<[string, SkillKey]> = [
      ["#skillCritChanceBtn", "critChance"],
      ["#skillCritDamageBtn", "critDamage"],
      ["#skillExtraChanceBtn", "extraChance"],
      ["#skillExtraCountBtn", "extraCount"],
      ["#skillLifeChanceBtn", "lifestealChance"],
      ["#skillLifeAmountBtn", "lifestealAmount"]
    ];

    skillButtons.forEach(([selector, key]) => {
      this.mountNode.querySelector<HTMLButtonElement>(selector)?.addEventListener("click", () => {
        this.handleFeedback(this.engine.upgradeSkill(key, this.batchCount));
      });
    });

    this.mountNode.querySelector<HTMLButtonElement>("#drawSingleBtn")?.addEventListener("click", () => this.handleFeedback(this.engine.drawCompanions(1)));
    this.mountNode.querySelector<HTMLButtonElement>("#drawMultiBtn")?.addEventListener("click", () => this.handleFeedback(this.engine.drawCompanions(11)));
    this.mountNode.querySelector<HTMLButtonElement>("#clearEquipBtn")?.addEventListener("click", () => this.handleFeedback(this.engine.clearEquippedCompanions()));

    this.mountNode.querySelector<HTMLButtonElement>("#closeDrawModalBtn")?.addEventListener("click", () => this.hideDrawModal());
    this.drawModal.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.dataset.action === "close-draw") this.hideDrawModal();
    });

    this.mountNode.querySelector<HTMLButtonElement>("#localSaveBtn")?.addEventListener("click", () => {
      this.localStorage.save(this.engine.serialize());
      this.pushNotice("로컬 저장 완료", "success");
    });

    this.mountNode.querySelector<HTMLButtonElement>("#localLoadBtn")?.addEventListener("click", () => {
      const data = this.localStorage.load();
      if (!data) {
        this.pushNotice("로컬 저장 데이터가 없습니다", "info");
        return;
      }
      this.engine.load(data);
      this.pushNotice("로컬 불러오기 완료", "success");
    });

    this.mountNode.querySelector<HTMLButtonElement>("#cloudSaveBtn")?.addEventListener("click", async () => {
      const ok = await this.progressApi.save(this.engine.serialize());
      this.pushNotice(ok ? "백엔드 저장 완료" : "백엔드 저장 실패", ok ? "success" : "danger");
    });

    this.mountNode.querySelector<HTMLButtonElement>("#cloudLoadBtn")?.addEventListener("click", async () => {
      const payload = await this.progressApi.load();
      if (!payload) {
        this.pushNotice("백엔드 저장 데이터가 없습니다", "info");
        return;
      }
      this.engine.load(payload);
      this.pushNotice("백엔드 불러오기 완료", "success");
    });

    this.companionList.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const card = target.closest<HTMLElement>(".companion-card[data-id]");
      if (!card) return;
      const id = card.dataset.id;
      if (!id) return;
      this.selectedCompanionId = id;
      this.renderSelectedCompanion();
      this.companionList
        .querySelectorAll<HTMLElement>(".companion-card.selected")
        .forEach((el) => el.classList.remove("selected"));
      card.classList.add("selected");
    });

    this.companionEquipBtn.addEventListener("click", () => {
      if (!this.selectedCompanionId) return;
      this.handleFeedback(this.engine.toggleEquipCompanion(this.selectedCompanionId));
      this.renderCompanionPanel();
    });

    this.companionLevelBtn.addEventListener("click", () => {
      if (!this.selectedCompanionId) return;
      this.handleFeedback(this.engine.levelUpCompanion(this.selectedCompanionId));
      this.renderCompanionPanel();
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
      const preview = feedback.draws
        .slice(0, 4)
        .map((v) => `${v.name}${v.isNew ? " 획득" : " 중복(+1조각)"}`)
        .join(" / ");
      this.drawResultText.textContent = `${feedback.draws.length}개 결과: ${preview}${feedback.draws.length > 4 ? " ..." : ""}`;
      this.showDrawModal(feedback.draws);
    }
  }

  private pushNotice(text: string, kind: Notice["kind"]): void {
    this.uiNotice = { text, kind, remain: 1.6 };
  }

  private tickNotice(dt: number): void {
    if (!this.uiNotice) return;
    this.uiNotice.remain -= dt;
    if (this.uiNotice.remain <= 0) this.uiNotice = null;
  }

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
    } else {
      this.fadeOverlayEl.style.opacity = "0";
    }

    this.prevHeroHp = state.heroHp;
    this.prevEnemyHp = state.enemy.hp;
  }

  private render(): void {
    const state = this.engine.state;
    const derived = this.engine.getDerivedStats();

    this.heroHpText.textContent = `${this.formatCompact(Math.floor(state.heroHp))} / ${this.formatCompact(derived.maxHp)}`;
    this.enemyHpText.textContent = `${this.formatCompact(Math.floor(state.enemy.hp))} / ${this.formatCompact(state.enemy.hpMax)}`;

    const heroRate = Math.max(0, Math.min(1, state.heroHp / Math.max(1, derived.maxHp)));
    const enemyRate = Math.max(0, Math.min(1, state.enemy.hp / Math.max(1, state.enemy.hpMax)));
    this.heroHpBar.style.width = `${heroRate * 100}%`;
    this.enemyHpBar.style.width = `${enemyRate * 100}%`;

    this.stageLabel.textContent = this.engine.getStageLabel();
    this.stageProgressBar.style.width = `${Math.max(0, Math.min(100, this.engine.getStageProgressRate() * 100))}%`;
    this.bossTimerText.textContent = state.enemy.type === "normal" ? "-" : `${Math.max(0, Math.ceil(state.bossTimeLeft))}초`;

    this.goldText.textContent = this.formatCompact(state.gold);
    this.diamondText.textContent = this.formatCompact(state.diamonds);
    this.powerText.textContent = this.formatCompact(derived.combatPower);
    this.enemyNameText.textContent = state.enemy.name;
    this.enemySprite.src = state.enemy.spritePath;

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
    this.renderUpgradePanel();
    this.renderSkillPanel();
    this.renderStatusPanel();
    this.renderCompanionPanel();
  }

  private renderTabs(): void {
    const tabs: Record<TabName, HTMLElement> = {
      status: this.statPanel,
      upgrade: this.upgradePanel,
      skill: this.skillPanel,
      companion: this.companionPanel
    };

    (Object.keys(tabs) as TabName[]).forEach((name) => {
      tabs[name].classList.toggle("active", this.activeTab === name);
      const btn = this.mountNode.querySelector(`button[data-tab='${name}']`);
      btn?.classList.toggle("active", this.activeTab === name);
    });
  }

  private renderUpgradePanel(): void {
    const state = this.engine.state;
    const attackCost = this.engine.getAttackUpgradeCost(this.batchCount);
    const hpCost = this.engine.getHpUpgradeCost(this.batchCount);
    const speedCount = this.engine.getSpeedUpgradableCount(this.batchCount);
    const speedCost = this.engine.getSpeedUpgradeCost(this.batchCount);

    this.attackCostText.textContent = this.renderCost(attackCost, this.batchCount, false);
    this.hpCostText.textContent = this.renderCost(hpCost, this.batchCount, false);
    this.speedCostText.textContent = speedCount > 0 ? this.renderCost(speedCost, speedCount, false) : "강화 완료";

    this.attackValueText.textContent = `현재 +${this.formatCompact((Math.pow(1.08, state.upgrades.attack) - 1) * 100)}%`;
    this.hpValueText.textContent = `현재 +${this.formatCompact((Math.pow(1.1, state.upgrades.hp) - 1) * 100)}%`;
    this.speedValueText.textContent = `현재 ${Math.min(10, 1 + 0.08 * state.upgrades.speed).toFixed(2)}회/초`;

    this.upgradeSummaryText.textContent = `강화 레벨: 공격 ${state.upgrades.attack} / 체력 ${state.upgrades.hp} / 공속 ${state.upgrades.speed}`;

    this.setButtonDisabled("#upgradeAttackBtn", state.gold < attackCost);
    this.setButtonDisabled("#upgradeHpBtn", state.gold < hpCost);
    this.setButtonDisabled("#upgradeSpeedBtn", speedCount <= 0 || state.gold < speedCost);

    const toggle = this.mountNode.querySelector<HTMLButtonElement>("#batchToggleBtn");
    if (toggle) toggle.textContent = `x${this.batchCount}`;
  }

  private renderSkillPanel(): void {
    const derived = this.engine.getDerivedStats();
    const skillToggle = this.mountNode.querySelector<HTMLButtonElement>("#skillBatchToggleBtn");
    if (skillToggle) skillToggle.textContent = `x${this.batchCount}`;

    const keys: Array<[SkillKey, string, string]> = [
      ["critChance", "#skillCritChanceBtn", `현재 확률 ${this.formatCompact(derived.critChance * 100)}%`],
      ["critDamage", "#skillCritDamageBtn", `현재 추가 ${this.formatCompact(derived.critDamageBonus * 100)}%`],
      ["extraChance", "#skillExtraChanceBtn", `현재 확률 ${this.formatCompact(derived.extraChance * 100)}%`],
      ["extraCount", "#skillExtraCountBtn", `현재 횟수 ${derived.extraCount}회`],
      ["lifestealChance", "#skillLifeChanceBtn", `현재 확률 ${this.formatCompact(derived.lifestealChance * 100)}%`],
      ["lifestealAmount", "#skillLifeAmountBtn", `현재 회복 ${this.formatCompact(derived.lifestealAmount * 100)}%`]
    ];

    keys.forEach(([key, selector, desc]) => {
      const info = this.engine.getSkillUpgradeCost(key, this.batchCount);
      this.skillCostEls[key].textContent = info.done ? "강화 완료" : this.renderCost(info.cost, info.count, false);
      this.skillDescEls[key].textContent = desc;
      this.setButtonDisabled(selector, info.done || this.engine.state.gold < info.cost);
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
    setText("#statSpeed", `${this.formatFixed3(breakdown.speed.total)}회/초 (${this.formatFixed3(breakdown.speed.base)} + ${this.formatFixed3(breakdown.speed.bonus)})`);
    setText("#statDps", f(derived.expectedDps));
    setText("#statCrit", `치확 ${fp(breakdown.critChance.total)} (${fp(breakdown.critChance.base)} + ${fp(breakdown.critChance.bonus)}) / 치피 ${fp(breakdown.critDamage.total)} (${fp(breakdown.critDamage.base)} + ${fp(breakdown.critDamage.bonus)})`);
    setText("#statExtra", `확률 ${fp(breakdown.extraChance.total)} (${fp(breakdown.extraChance.base)} + ${fp(breakdown.extraChance.bonus)}) / ${f(breakdown.extraCount.total)}회`);
    setText("#statLife", `확률 ${fp(breakdown.lifestealChance.total)} (${fp(breakdown.lifestealChance.base)} + ${fp(breakdown.lifestealChance.bonus)}) / 회복 ${fp(breakdown.lifestealAmount.total)} (${fp(breakdown.lifestealAmount.base)} + ${fp(breakdown.lifestealAmount.bonus)})`);
    setText("#statPower", f(derived.combatPower));
  }

  private renderCompanionPanel(): void {
    const state = this.engine.state;
    const companions = this.engine.getCompanions();

    if (!this.selectedCompanionId || !companions.some((c) => c.id === this.selectedCompanionId)) {
      const firstOwned = companions.find((c) => this.engine.getCompanionRuntime(c.id).level > 0);
      this.selectedCompanionId = (firstOwned ?? companions[0] ?? null)?.id ?? null;
    }

    this.companionSlotText.textContent = `${state.equippedCompanionIds.length} / ${this.engine.getUnlockedCompanionSlots()}`;
    const effectSummary = this.engine.getCompanionEffectSummaryText();
    const effectParts = effectSummary.split(" / ");
    this.companionEffectText.textContent = effectParts[0]?.trim() ?? "보유 효과: 없음";
    this.companionEffectEquippedText.textContent = effectParts[1]?.trim() ?? "장착 효과: 없음";
    this.drawCountText.textContent = this.formatCompact(state.drawCount);

    this.setButtonDisabled("#drawSingleBtn", state.diamonds < 10);
    this.setButtonDisabled("#drawMultiBtn", state.diamonds < 100);

    const listHtml = companions.map((c) => this.renderCompanionCard(c)).join("");
    if (listHtml !== this.companionListHtmlCache) {
      this.companionList.innerHTML = listHtml;
      this.companionListHtmlCache = listHtml;
    }
    this.renderSelectedCompanion();
  }

  private renderCompanionCard(def: CompanionDefinition): string {
    const rt = this.engine.getCompanionRuntime(def.id);
    const owned = rt.level > 0;
    const equipped = this.engine.state.equippedCompanionIds.includes(def.id);
    const selected = this.selectedCompanionId === def.id;

    const stateClass = !owned ? "state-unowned" : equipped ? "state-equipped" : "state-owned";
    const stateTitle = !owned ? "미보유" : equipped ? "장착" : "미장착";

    return `
      <article class="companion-card tier-${def.tier} ${equipped ? "equipped" : ""} ${selected ? "selected" : ""}" data-id="${def.id}">
        <header>
          <strong title="${def.name}">${def.name}</strong>
          <div class="card-badges">
            <span class="state-dot ${stateClass}" title="${stateTitle}" aria-label="${stateTitle}"></span>
            <span class="tier-badge tier-${def.tier}">${this.tierText(def.tier)}</span>
          </div>
        </header>
        <p>Lv ${this.formatCompact(rt.level)}${owned ? ` · 조각 ${this.formatCompact(rt.shards)}` : " · 미획득"}</p>
      </article>
    `;
  }

  private renderSelectedCompanion(): void {
    if (!this.selectedCompanionId) return;

    const def = this.engine.getCompanions().find((v) => v.id === this.selectedCompanionId);
    if (!def) return;

    const rt = this.engine.getCompanionRuntime(def.id);
    const owned = rt.level > 0;
    const equipped = this.engine.state.equippedCompanionIds.includes(def.id);
    const levelCost = this.engine.companionLevelUpCost(def.id);

    this.companionDetailName.textContent = def.name;
    this.companionDetailTier.textContent = this.tierText(def.tier);
    this.companionDetailTier.className = `tier-badge tier-${def.tier}`;
    this.companionDetailMeta.textContent = `레벨 ${this.formatCompact(rt.level)} · 조각 ${this.formatCompact(rt.shards)}`;
    this.companionDetailOwned.textContent = `보유 효과: ${this.effectToText(def.ownedEffect)}`;
    this.companionDetailEquipped.textContent = `장착 효과: ${this.effectToText(def.equippedEffect)}`;

    this.companionEquipBtn.textContent = equipped ? "장착 해제" : "장착";
    this.companionEquipBtn.disabled = !owned;

    if (!owned) {
      this.companionLevelBtn.textContent = "강화 불가";
      this.companionLevelBtn.disabled = true;
      return;
    }

    if (rt.level >= 10 || levelCost <= 0) {
      this.companionLevelBtn.textContent = "강화 완료";
      this.companionLevelBtn.disabled = true;
      return;
    }

    this.companionLevelBtn.textContent = `강화 (${this.formatCompact(levelCost)} 다이아 + 조각 1)`;
    this.companionLevelBtn.disabled = rt.shards < 1 || this.engine.state.diamonds < levelCost;
  }

  private effectToText(effect: CompanionEffect): string {
    const parts: string[] = [];
    if (effect.atk) parts.push(`공격력 +${this.formatCompact(effect.atk * 100)}%`);
    if (effect.hp) parts.push(`체력 +${this.formatCompact(effect.hp * 100)}%`);
    if (effect.speed) parts.push(`공격속도 +${this.formatCompact(effect.speed * 100)}%`);
    if (effect.crit) parts.push(`치명타 확률 +${this.formatCompact(effect.crit * 100)}%`);
    if (effect.critDmg) parts.push(`치명타 데미지 +${this.formatCompact(effect.critDmg * 100)}%`);
    if (effect.gold) parts.push(`골드 획득 +${this.formatCompact(effect.gold * 100)}%`);
    if (effect.lifesteal) parts.push(`흡혈 +${this.formatCompact(effect.lifesteal * 100)}%`);
    if (effect.cleave) parts.push(`추가타 +${this.formatCompact(effect.cleave * 100)}%`);
    return parts.length > 0 ? parts.join(", ") : "효과 없음";
  }

  private tierText(tier: number): string {
    if (tier === 1) return "T1 일반";
    if (tier === 2) return "T2 고급";
    if (tier === 3) return "T3 영웅";
    return "T4 전설";
  }

  private showDrawModal(draws: NonNullable<ActionFeedback["draws"]>): void {
    const title = draws.length >= 11 ? "11연 동료 뽑기" : "동료 뽑기 결과";
    this.drawModalTitle.textContent = title;
    this.drawModalCards.innerHTML = draws
      .map(
        (v, idx) => `
        <article class="draw-card tier-${v.tier} ${v.isNew ? "new" : "dup"}" style="animation-delay:${idx * 50}ms">
          <header>
            <span class="tier-badge tier-${v.tier}">${this.tierText(v.tier)}</span>
            <strong>${v.name}</strong>
          </header>
          <p>${v.isNew ? "신규 획득" : "중복 획득 (+1 조각)"}</p>
          <small>Lv ${this.formatCompact(v.level)} · 조각 ${this.formatCompact(v.shards)}</small>
        </article>
      `
      )
      .join("");

    this.drawModal.classList.add("show");
    this.drawModal.setAttribute("aria-hidden", "false");
  }

  private hideDrawModal(): void {
    this.drawModal.classList.remove("show");
    this.drawModal.setAttribute("aria-hidden", "true");
  }

  private setButtonDisabled(selector: string, disabled: boolean): void {
    const btn = this.mountNode.querySelector<HTMLButtonElement>(selector);
    if (!btn) return;
    btn.disabled = disabled;
    btn.classList.toggle("disabled", disabled);
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

  private renderCost(cost: number, count: number, done: boolean): string {
    if (done || count <= 0) return "강화 완료";
    if (this.batchCount === 1) return this.formatCompact(cost);
    return `${this.formatCompact(cost)} (${count}회)`;
  }

  private expNeed(level: number): number {
    return Math.floor(12 * Math.pow(1.5, Math.max(0, level - 1)));
  }

  private template(): string {
    return `
      <div class="game-root" id="gameRoot">
        <section class="card header-card">
          <h1>자동전투 강화 Idle (TypeScript 모듈판)</h1>
          <p>전투 화면 고정, 상태 아이콘 표시, 동료 상세 패널을 적용했습니다.</p>
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
            <div class="row-btns"><button id="localSaveBtn">로컬 저장</button><button id="localLoadBtn">로컬 불러오기</button><button id="cloudSaveBtn">백엔드 저장</button><button id="cloudLoadBtn">백엔드 불러오기</button></div>
          </div>

          <div id="panel-upgrade" class="panel active">
            <h2>기본 강화</h2><div class="row-btns"><button id="batchToggleBtn">x1</button></div>
            <div class="grid one">
              <button id="upgradeAttackBtn">공격력 강화 <small id="attackValueText">+0%</small><span id="attackCostText">0</span></button>
              <button id="upgradeHpBtn">체력 강화 <small id="hpValueText">+0%</small><span id="hpCostText">0</span></button>
              <button id="upgradeSpeedBtn">공격속도 강화 <small id="speedValueText">1.00회/초</small><span id="speedCostText">0</span></button>
            </div>
            <p id="upgradeSummaryText" class="muted"></p>
          </div>

          <div id="panel-skill" class="panel">
            <h2>스킬 강화</h2><div class="row-btns"><button id="skillBatchToggleBtn">x1</button></div>
            <div class="grid one">
              <button id="skillCritChanceBtn">치명타 확률 <small id="skillDesc-critChance"></small><span id="skillCost-critChance"></span></button>
              <button id="skillCritDamageBtn">치명타 데미지 <small id="skillDesc-critDamage"></small><span id="skillCost-critDamage"></span></button>
              <button id="skillExtraChanceBtn">추가타 확률 <small id="skillDesc-extraChance"></small><span id="skillCost-extraChance"></span></button>
              <button id="skillExtraCountBtn">추가타 횟수 <small id="skillDesc-extraCount"></small><span id="skillCost-extraCount"></span></button>
              <button id="skillLifeChanceBtn">흡혈 확률 <small id="skillDesc-lifestealChance"></small><span id="skillCost-lifestealChance"></span></button>
              <button id="skillLifeAmountBtn">흡혈 회복량 <small id="skillDesc-lifestealAmount"></small><span id="skillCost-lifestealAmount"></span></button>
            </div>
          </div>

          <div id="panel-companion" class="panel">
            <h2>동료</h2>
            <div class="row top-info"><span>장착 슬롯 <strong id="companionSlotText">0 / 0</strong></span><span>총 뽑기 <strong id="drawCountText">0</strong></span></div>
            <p id="companionEffectText" class="muted">보유 효과: 없음</p>
            <p id="companionEquippedEffectText" class="muted">장착 효과: 없음</p>
            <div class="row-btns"><button id="drawSingleBtn">1회 뽑기 (10)</button><button id="drawMultiBtn">11회 뽑기 (100)</button><button id="clearEquipBtn">장착 전체 해제</button></div>
            <p id="drawResultText" class="muted"></p>

            <div class="companion-detail" id="companionDetailBox">
              <div class="detail-head">
                <strong id="compDetailName">-</strong>
                <span id="compDetailTier" class="tier-badge tier-1">T1 일반</span>
              </div>
              <p id="compDetailMeta" class="muted">-</p>
              <p id="compDetailOwned" class="muted">보유 효과: -</p>
              <p id="compDetailEquipped" class="muted">장착 효과: -</p>
              <div class="row-btns comp-actions">
                <button id="compEquipBtn">장착</button>
                <button id="compLevelBtn">강화</button>
              </div>
            </div>

            <div id="companionList" class="companion-list"></div>
          </div>
        </section>

        <div id="drawModal" class="draw-modal" aria-hidden="true">
          <div class="draw-modal-backdrop" data-action="close-draw"></div>
          <div class="draw-modal-sheet">
            <div class="draw-modal-head">
              <strong id="drawModalTitle">동료 뽑기 결과</strong>
              <button id="closeDrawModalBtn" type="button">닫기</button>
            </div>
            <div id="drawModalCards" class="draw-cards"></div>
          </div>
        </div>
      </div>
    `;
  }
}

