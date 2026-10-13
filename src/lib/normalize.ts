// Pure normalization helpers. No I/O — fully unit-tested in tests/normalize.test.ts.

export type EntityType =
  | "individual" | "trust" | "llc" | "limited_partnership" | "partnership"
  | "corporation" | "nonprofit" | "government" | "other" | "unknown";

const SUFFIXES: Record<string, string> = {
  STREET: "ST", AVENUE: "AVE", BOULEVARD: "BLVD", BL: "BLVD", DRIVE: "DR", ROAD: "RD", PLACE: "PL",
  COURT: "CT", CIRCLE: "CIR", LANE: "LN", PARKWAY: "PKWY", PKY: "PKWY", TERRACE: "TER", WAY: "WAY",
  HIGHWAY: "HWY", TRAIL: "TRL", SQUARE: "SQ", NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W",
  APARTMENT: "APT", SUITE: "STE",
};

export function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  if (!s || /^\*+$/.test(s) || s.toUpperCase() === "NAN" || s.toUpperCase() === "NULL") return null;
  return s;
}

/** Uppercase, strip punctuation, standardize suffixes. Used as the dedupe key for addresses. */
export function normalizeAddress(addr: string | null | undefined): string {
  const s = clean(addr);
  if (!s) return "";
  return s
    .toUpperCase()
    .replace(/[.,#]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => SUFFIXES[t] ?? t)
    .join(" ");
}

const KEEP_UPPER = new Set(["LLC", "LP", "LLP", "INC", "II", "III", "IV", "PO", "NE", "NW", "SE", "SW", "USA", "CA", "UTC", "TR"]);

/** "1023-25 12TH ST" -> "1023-25 12th St"; "WERBY L L C" -> "Werby LLC" */
export function displayCase(v: string | null | undefined): string | null {
  const s = clean(v);
  if (!s) return null;
  return s
    .replace(/\bL\s+L\s+C\b/gi, "LLC")
    .replace(/\bL\s+P\b/gi, "LP")
    .split(" ")
    .map((w) => {
      const up = w.toUpperCase();
      if (KEEP_UPPER.has(up.replace(/[^A-Z]/g, ""))) return up;
      if (/^\d/.test(w)) return w.toLowerCase(); // 12TH -> 12th, 232-60 stays
      return w.toLowerCase().replace(/(^|[-'(/&])([a-z])/g, (_m, p, c) => p + c.toUpperCase());
    })
    .join(" ");
}

export function normalizeName(name: string | null | undefined): string {
  const s = clean(name);
  if (!s) return "";
  return s
    .toUpperCase()
    .replace(/\bL\s*L\s*C\b/g, "LLC")
    .replace(/\bL\s*P\b/g, "LP")
    .replace(/[.,'"]/g, "")
    .replace(/&/g, " AND ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Digits-only APN key. Returns null if the value doesn't look like an APN (8–14 digits). */
export function apnKey(raw: unknown): string | null {
  const s = clean(raw);
  if (!s) return null;
  if (/[a-z]/i.test(s) || /^\(\d{3}\)/.test(s)) return null; // phone numbers or text in APN column
  const d = s.replace(/\D/g, "");
  if (d.length < 8 || d.length > 14) return null;
  return d;
}

/** Keeps the county's own grouping ("625  401 011" -> "625-401-011") rather than guessing a format. */
export function apnDisplay(raw: unknown): string | null {
  const s = clean(raw);
  if (!s) return null;
  return s.split(/\s+/).join("-");
}

export function phoneDigits(raw: unknown): string | null {
  const s = clean(raw);
  if (!s) return null;
  let d = s.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? d : null;
}

export function formatPhone(raw: unknown): string | null {
  const d = phoneDigits(raw);
  return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
}

export function looksLikePhone(raw: unknown): boolean {
  const s = clean(raw);
  return !!s && /^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(s);
}

export function zip5(raw: unknown): string | null {
  const s = clean(raw);
  if (!s) return null;
  const d = s.replace(/\.0+$/, "").replace(/\D/g, "");
  if (d.length === 5) return d;
  if (d.length === 9) return d.slice(0, 5);
  if (d.length === 4) return "0" + d; // leading zero lost in Excel (out-of-state owners)
  return null;
}

export function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Accepts Date objects, Excel serials, ISO and US strings. Placeholder dates (1900 / 00-00-1900) -> null. */
export function toDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  let d: Date | null = null;
  if (raw instanceof Date) d = raw;
  else if (typeof raw === "number") {
    if (raw > 20000 && raw < 80000) d = new Date(Math.round((raw - 25569) * 86400 * 1000)); // Excel serial
    else if (raw >= 19000101 && raw <= 21001231) {
      const s = String(raw);
      d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
    }
  } else {
    const s = String(raw).trim();
    if (/^0{1,2}[-/]0{1,2}[-/]/.test(s)) return null;
    const us = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (us) d = new Date(Date.UTC(+us[3], +us[1] - 1, +us[2]));
    else if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s.slice(0, 10) + "T00:00:00Z");
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y <= 1901 || y > new Date().getUTCFullYear() + 1) return null;
  return d.toISOString().slice(0, 10);
}

export function classifyEntity(name: string | null | undefined): EntityType {
  const n = normalizeName(name);
  if (!n) return "unknown";
  if (/\b(CITY OF|COUNTY OF|STATE OF|HOUSING AUTHORITY|HOUSING COMMISSION|UNITED STATES|U S NAVY|NAVY|MARINE CORPS|REDEVELOPMENT AGENCY|SCHOOL DISTRICT|REGENTS OF|UNIV OF CALIF|UNIVERSITY OF CALIFORNIA)\b/.test(n)) return "government";
  if (/\bLLC\b|LIMITED LIABILITY/.test(n)) return "llc";
  if (/\bTRUST\b|\bTR\b|\bTRS\b|\bTRUSTEES?\b|\bREVOCABLE\b|\bLIVING TR/.test(n)) return "trust";
  if (/\bLP\b|\bLTD\b|LIMITED PARTNERSHIP|LIMITED PTRSHP|\bLTD PTRSHP\b|\bLIMITED$/.test(n)) return "limited_partnership";
  if (/\bESTATE OF\b|\bEST OF\b/.test(n)) return "other"; // decedent's estate
  if (/\bCHURCH\b|PRESBYTER|\bFOUNDATION\b|MINISTR|NON ?PROFIT|\bDIOCESE\b|\bSOCIETY\b|\bCOUNCIL\b|HEALTH (CTRS|CENTERS)/.test(n)) return "nonprofit";
  if (/\bINC\b|\bCORP\b|CORPORATION|\bCOMPANY\b|\bCO\b|\bHOLDINGS\b/.test(n)) return "corporation";
  if (/PARTNERSHIP|PTRSHP|PARTNERS\b|\bASSOCIATES\b|\bASSOCS?\b|\bVENTURES?\b|\bGROUP\b|\bPROPERTIES\b|\bINVESTMENTS?\b/.test(n)) return "partnership";
  // Business-sounding names without a legal suffix: don't pretend they're people
  if (/\b(APTS|APARTMENTS|HOUSING|TOWERS?|SENIOR|VILLAGE|VLG|MANOR|GARDENS|TOWNHOMES|HOMES|RESIDL|RESIDENTIAL|SPE|CIC|NUMBER|COMMUNITIES|COMMUNITY|SVCS|SERVICES|DEVELOPMENT|DEV|ENTERPRISES|REALTY|MGMT|MANAGEMENT|U T C|UTC)\b|\d{2,}/.test(n)) return "unknown";
  const tokens = n.replace(/\bAND\b/g, " ").split(" ").filter(Boolean);
  if (tokens.length >= 2 && tokens.length <= 7 && tokens.every((t) => /^[A-Z-]+$/.test(t) || /^\d(ST|ND|RD|TH)$/.test(t))) return "individual";
  return "unknown";
}

export const CONSTRUCTION_TYPES = new Set([
  "STUCCO", "FRAME-STUCCO", "WOODFRAME", "CONCRETE", "FRAME", "BRICK", "BRICK-FRAME", "BRICK-STUCCO",
  "STEEL", "MASONRY", "BLOCK", "UNKNOWN",
]);

export function propertyTypeFromUnits(units: number | null): string | null {
  if (units === null) return null;
  if (units >= 5) return "multifamily_5plus";
  if (units >= 2) return "multifamily_2_4";
  return null;
}
