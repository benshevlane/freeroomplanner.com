// ---------------------------------------------------------------------------
// Affiliate lookup table.
//
// The whole affiliate system is driven by this one file: look up the
// visitor's country + room type, get back the offers to show. Adding,
// swapping or pausing a partner is editing an entry here — nothing else in
// the app changes. Links can come from any network (CJ, Awin, FlexOffers);
// the app only ever sees a click URL + a label.
//
// SubID: each outbound click carries a SubID encoding country, room type and
// the plan code, so network reports show exactly which designs drove clicks.
// ---------------------------------------------------------------------------

export type RoomType = "kitchen" | "bathroom" | "office" | "general";
export type AffiliateRole = "product" | "trade";

export interface AffiliateOffer {
  partner: string;          // display name, e.g. "Angi"
  network: string;          // for our reference only: "CJ" | "Awin" | "FlexOffers"
  role: AffiliateRole;      // "product" (shop) or "trade" (get it built)
  headline: string;         // card title
  blurb: string;            // one-line description
  clickUrl: string;         // the network click URL (before SubID)
  active: boolean;          // instant on/off without deleting the entry
}

// country -> room type -> ordered list of offers.
// "_default" under a country applies to any room type without its own entry.
type CountryTable = Partial<Record<RoomType | "_default", AffiliateOffer[]>>;

const ANGI_REMODEL = "https://www.dpbolvw.net/click-101812401-17142833"; // CJ: Additions & Remodeling (kitchen/bath/room)

export const AFFILIATES: Record<string, CountryTable> = {
  US: {
    kitchen: [
      {
        partner: "Angi",
        network: "CJ",
        role: "trade",
        headline: "Get quotes to build this kitchen",
        blurb:
          "Angi connects you with vetted local pros. Send your floor plan so quotes match what you designed.",
        clickUrl: ANGI_REMODEL,
        active: true,
      },
    ],
    bathroom: [
      {
        partner: "Angi",
        network: "CJ",
        role: "trade",
        headline: "Get quotes to build this bathroom",
        blurb:
          "Angi connects you with vetted local pros. Send your floor plan so quotes match what you designed.",
        clickUrl: ANGI_REMODEL,
        active: true,
      },
    ],
    general: [
      {
        partner: "Angi",
        network: "CJ",
        role: "trade",
        headline: "Get quotes to remodel this room",
        blurb:
          "Angi connects you with vetted local pros for remodels and additions. Send them your exact plan.",
        clickUrl: ANGI_REMODEL,
        active: true,
      },
    ],
    // office: no trade partner yet — the card simply won't render.
    _default: [
      {
        partner: "Angi",
        network: "CJ",
        role: "trade",
        headline: "Get quotes to build this project",
        blurb:
          "Angi connects you with vetted local pros. Send them your exact floor plan.",
        clickUrl: ANGI_REMODEL,
        active: true,
      },
    ],
  },
  // UK, AU, CA, etc. added here as programmes get approved.
};

/** Builds a URL-safe SubID: country_room_plancode, capped for network limits. */
export function buildSubId(
  country: string | null,
  roomType: RoomType | null,
  planCode: string | null
): string {
  return [country || "xx", roomType || "gen", planCode || "nolink"]
    .join("_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .slice(0, 60);
}

/** Appends the SubID to a CJ-style click URL (param name `sid`). */
export function withSubId(clickUrl: string, subId: string): string {
  const sep = clickUrl.includes("?") ? "&" : "?";
  return `${clickUrl}${sep}sid=${encodeURIComponent(subId)}`;
}

export interface ResolvedOffer extends AffiliateOffer {
  url: string; // clickUrl + SubID, ready to open
}

/**
 * Returns the affiliate offers to show for a country + room type, with the
 * SubID already applied. Falls back to the country's _default, then to
 * nothing (an empty result renders no cards — never a broken slot).
 */
export function getOffers(
  country: string | null,
  roomType: RoomType | null,
  planCode: string | null
): { products: ResolvedOffer[]; trade: ResolvedOffer | null } {
  const table = country ? AFFILIATES[country.toUpperCase()] : undefined;
  const list =
    (roomType && table?.[roomType]) || table?._default || [];
  const subId = buildSubId(country, roomType, planCode);

  const resolved = list
    .filter((o) => o.active)
    .map((o) => ({ ...o, url: withSubId(o.clickUrl, subId) }));

  return {
    products: resolved.filter((o) => o.role === "product"),
    trade: resolved.find((o) => o.role === "trade") ?? null,
  };
}
