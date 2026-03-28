import type { PersistedGameData } from "../core/types";

export class ProgressApiService {
  constructor(private readonly playerId: string) {}

  async load(): Promise<PersistedGameData | null> {
    const res = await fetch(`/api/progress/${this.playerId}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { payload?: PersistedGameData | null };
    return json.payload ?? null;
  }

  async save(payload: PersistedGameData): Promise<boolean> {
    const res = await fetch(`/api/progress/${this.playerId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return res.ok;
  }
}