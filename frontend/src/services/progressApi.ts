import type { PersistedGameData } from "../core/types";

interface AuthUser {
  id: number;
  username: string;
}

interface AuthSession {
  token: string;
  user: AuthUser;
}

export type RankingType = "power" | "stage";

export interface RankingEntry {
  rank: number;
  playerId: string;
  playerName: string;
  combatPower: number;
  maxStageIndex: number;
  updatedAt: string | null;
}

export class ProgressApiService {
  private readonly sessionKey = "idle-game-auth-v1";

  private loadSession(): AuthSession | null {
    try {
      const raw = localStorage.getItem(this.sessionKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AuthSession;
      if (!parsed || typeof parsed !== "object") return null;
      if (!parsed.token || !parsed.user || typeof parsed.user.username !== "string") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private saveSession(session: AuthSession | null): void {
    if (!session) {
      localStorage.removeItem(this.sessionKey);
      return;
    }
    localStorage.setItem(this.sessionKey, JSON.stringify(session));
  }

  getSession(): AuthSession | null {
    return this.loadSession();
  }

  isAuthenticated(): boolean {
    return !!this.loadSession();
  }

  private async requestAuth(path: string, username: string, password: string): Promise<{ ok: boolean; message?: string }> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; token?: string; user?: AuthUser; message?: string };
    if (!res.ok || !json.ok || !json.token || !json.user) {
      return { ok: false, message: json.message ?? "인증 실패" };
    }
    this.saveSession({ token: json.token, user: json.user });
    return { ok: true };
  }

  async register(username: string, password: string): Promise<{ ok: boolean; message?: string }> {
    return this.requestAuth("/api/auth/register", username, password);
  }

  async login(username: string, password: string): Promise<{ ok: boolean; message?: string }> {
    return this.requestAuth("/api/auth/login", username, password);
  }

  async logout(): Promise<void> {
    const session = this.loadSession();
    if (session) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` }
      }).catch(() => undefined);
    }
    this.saveSession(null);
  }

  async ensureAuthenticatedInteractive(): Promise<{ ok: boolean; message?: string }> {
    if (this.isAuthenticated()) return { ok: true };

    const modeRaw = window.prompt("계정 모드 선택: login 또는 register", "login");
    if (!modeRaw) return { ok: false, message: "인증이 취소되었습니다" };
    const mode = modeRaw.trim().toLowerCase();

    const username = window.prompt("아이디 입력 (영문/숫자/_/-, 3~24자)", "");
    if (!username) return { ok: false, message: "아이디 입력이 취소되었습니다" };

    const password = window.prompt("비밀번호 입력 (4자 이상)", "");
    if (!password) return { ok: false, message: "비밀번호 입력이 취소되었습니다" };

    if (mode === "register" || mode === "r" || mode === "signup") {
      return this.register(username, password);
    }
    return this.login(username, password);
  }

  private authHeader(): HeadersInit {
    const session = this.loadSession();
    if (!session) return {};
    return { Authorization: `Bearer ${session.token}` };
  }

  async load(): Promise<PersistedGameData | null> {
    const session = this.loadSession();
    if (!session) return null;
    const res = await fetch("/api/progress/me", { headers: this.authHeader() });
    if (!res.ok) return null;
    const json = (await res.json()) as { payload?: PersistedGameData | null };
    return json.payload ?? null;
  }

  async save(payload: PersistedGameData, combatPower = 0): Promise<boolean> {
    const session = this.loadSession();
    if (!session) return false;
    const safeCombatPower = Number.isFinite(combatPower) ? Math.max(0, Math.floor(combatPower)) : 0;
    const body = { ...payload, __combatPower: safeCombatPower };

    const res = await fetch("/api/progress/me", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.authHeader()
      },
      body: JSON.stringify(body)
    });
    return res.ok;
  }

  async getRanking(type: RankingType, limit = 20): Promise<RankingEntry[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20;
    const res = await fetch(`/api/ranking?type=${type}&limit=${safeLimit}`);
    if (!res.ok) return [];

    const json = (await res.json().catch(() => ({}))) as { ranking?: RankingEntry[] };
    return Array.isArray(json.ranking) ? json.ranking : [];
  }

  async getPowerRanking(limit = 20): Promise<RankingEntry[]> {
    return this.getRanking("power", limit);
  }
}
