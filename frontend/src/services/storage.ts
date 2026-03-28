import type { PersistedGameData } from "../core/types";

export class LocalStorageService {
  constructor(private readonly key: string) {}

  load(): PersistedGameData | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedGameData;
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  save(data: PersistedGameData): void {
    localStorage.setItem(this.key, JSON.stringify(data));
  }
}