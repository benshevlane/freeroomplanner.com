import { safeGetItem, safeSetItem } from "./safe-storage";

// ---------------------------------------------------------------------------
// Client helpers for the save & share feature.
//
// Every plan saved to the cloud gets a short code (e.g. K7M2XQ4A) and a
// secret edit key. The edit key stays in this browser only — whoever has it
// can update that plan in place; everyone else who opens the link edits a
// copy and gets their own new code when they save.
// ---------------------------------------------------------------------------

const KEYS_STORAGE = "freeroomplanner-plan-keys";

export interface SharedPlanResult {
  code: string;
  /** Absolute URL to share. */
  url: string;
  /** True when an existing plan was updated rather than a new one created. */
  updated: boolean;
  /** Visitor's country (ISO-2) as detected at save time, if available. */
  country: string | null;
}

type KeyMap = Record<string, string>;

function readKeys(): KeyMap {
  try {
    return JSON.parse(safeGetItem(KEYS_STORAGE) || "{}") as KeyMap;
  } catch {
    return {};
  }
}

export function getOwnedEditKey(code: string): string | null {
  return readKeys()[code] ?? null;
}

function rememberEditKey(code: string, editKey: string): void {
  const keys = readKeys();
  keys[code] = editKey;
  safeSetItem(KEYS_STORAGE, JSON.stringify(keys));
}

/** Maps the "What are you planning?" intent to an affiliate-ready category. */
export function intentToRoomType(): string | null {
  const intent = safeGetItem("freeroomplanner-intent");
  if (!intent) return null;
  try {
    const value = JSON.parse(intent);
    const map: Record<string, string> = {
      kitchen_renovation: "kitchen",
      bathroom_renovation: "bathroom",
      living_room_refresh: "general",
      bedroom_refresh: "general",
      full_home_renovation: "general",
      new_furniture_shopping: "general",
      measuring_space: "general",
    };
    return map[String(value)] ?? null;
  } catch {
    return null;
  }
}

export function planUrlFor(code: string): string {
  return `${window.location.origin}/p/${code}`;
}

/**
 * Saves a plan to the cloud. If `existingCode` is provided and this browser
 * holds its edit key, the plan is updated in place (same link); otherwise a
 * new plan + link is created.
 */
export async function savePlanToCloud(
  data: unknown,
  opts: { name?: string; roomType?: string | null; existingCode?: string | null } = {}
): Promise<SharedPlanResult> {
  const { name, roomType, existingCode } = opts;

  if (existingCode) {
    const editKey = getOwnedEditKey(existingCode);
    if (editKey) {
      const res = await fetch("/api/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: existingCode, editKey, data, name, roomType: roomType ?? undefined }),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { country?: string | null };
        return {
          code: existingCode,
          url: planUrlFor(existingCode),
          updated: true,
          country: body.country ?? null,
        };
      }
      // If the update is rejected (e.g. plan was deleted), fall through and
      // create a fresh plan instead — the user must never lose a save.
    }
  }

  const res = await fetch("/api/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, name, roomType: roomType ?? undefined }),
  });
  if (!res.ok) {
    throw new Error("save-failed");
  }
  const body = (await res.json()) as { id: string; editKey: string; country?: string | null };
  rememberEditKey(body.id, body.editKey);
  return {
    code: body.id,
    url: planUrlFor(body.id),
    updated: false,
    country: body.country ?? null,
  };
}

export interface FetchedPlan {
  id: string;
  name: string;
  data: unknown;
  roomType: string | null;
}

export async function fetchSharedPlan(code: string): Promise<FetchedPlan | null> {
  const res = await fetch(`/api/plans?id=${encodeURIComponent(code.toUpperCase())}`);
  if (!res.ok) return null;
  return (await res.json()) as FetchedPlan;
}
