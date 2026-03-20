import { UnitSystem } from "./types";

export interface EmbedParams {
  partner: string | null;
  brandColor: string | null;
  dark: boolean | null;
  units: UnitSystem;
  hideToolbar: boolean;
  embed: boolean;
  source: string | null;
  type: "fullpage" | "homepage" | null;
}

export function parseEmbedParams(searchString: string): EmbedParams {
  const params = new URLSearchParams(searchString);

  // partner: alphanumeric, hyphens, underscores only, max 64 chars
  let partner: string | null = null;
  const rawPartner = params.get("partner");
  if (rawPartner && /^[a-zA-Z0-9_-]{1,64}$/.test(rawPartner)) {
    partner = rawPartner;
  }

  // brandColor: valid 3–8 char hex without #
  let brandColor: string | null = null;
  const rawColor = params.get("brand_color");
  if (rawColor && /^[0-9a-fA-F]{3,8}$/.test(rawColor)) {
    brandColor = rawColor;
  }

  // dark: "1" = true, "0" = false, absent = null
  let dark: boolean | null = null;
  const rawDark = params.get("dark");
  if (rawDark === "1") dark = true;
  else if (rawDark === "0") dark = false;

  // units: default "m"
  let units: UnitSystem = "m";
  const rawUnits = params.get("units");
  if (rawUnits === "m" || rawUnits === "cm" || rawUnits === "mm" || rawUnits === "ft") {
    units = rawUnits;
  }

  // hideToolbar: default false
  const hideToolbar = params.get("hide_toolbar") === "1";

  // embed: marks iframe context
  const rawEmbed = params.get("embed");
  const embed = rawEmbed === "true" || rawEmbed === "1";

  // source: campaign/referral tracking slug
  let source: string | null = null;
  const rawSource = params.get("source");
  if (rawSource && /^[a-zA-Z0-9_-]{1,64}$/.test(rawSource)) {
    source = rawSource;
  }

  // type: layout mode
  let type: "fullpage" | "homepage" | null = null;
  const rawType = params.get("type");
  if (rawType === "fullpage" || rawType === "homepage") {
    type = rawType;
  }

  // Silently ignore any badge-hiding parameters
  // (hide_badge, no_badge, disable_badge, etc. are never parsed)

  return {
    partner,
    brandColor,
    dark,
    units,
    hideToolbar,
    embed,
    source,
    type,
  };
}
