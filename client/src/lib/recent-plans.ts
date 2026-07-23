// Lightweight history of recently saved plans, kept in localStorage so a user
// can reopen a previous plan without hunting for the exported file.
export interface RecentPlan {
  id: string;
  name: string;
  ts: number;   // epoch ms
  data: string; // JSON.stringify(editor.exportState())
}

const KEY = "freeroomplanner-recent-plans";
const MAX = 8;

export function getRecentPlans(): RecentPlan[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as RecentPlan[]) : [];
  } catch {
    return [];
  }
}

/** Record a saved plan at the top of the recent list (deduped, capped). */
export function recordRecentPlan(name: string, data: string): RecentPlan[] {
  try {
    const list = getRecentPlans().filter((p) => p.data !== data);
    const entry: RecentPlan = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: (name || "Untitled plan").trim() || "Untitled plan",
      ts: Date.now(),
      data,
    };
    const next = [entry, ...list].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    return getRecentPlans();
  }
}
