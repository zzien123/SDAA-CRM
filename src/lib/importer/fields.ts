import { looksLikePhone } from "../normalize";

export const PROPERTY_OWNER_FIELDS = [
  { key: "apn", label: "APN / Parcel #", group: "Property" },
  { key: "street_address", label: "Property address", group: "Property", required: true },
  { key: "city", label: "Property city", group: "Property" },
  { key: "zip", label: "Property ZIP", group: "Property" },
  { key: "units", label: "Units", group: "Property" },
  { key: "year_built", label: "Year built", group: "Property" },
  { key: "floors", label: "Floors / stories", group: "Property" },
  { key: "construction_type", label: "Construction type", group: "Property" },
  { key: "building_sf", label: "Building SF", group: "Property" },
  { key: "lot_sf", label: "Lot SF", group: "Property" },
  { key: "zoning", label: "Zoning", group: "Property" },
  { key: "land_value", label: "Assessed land value", group: "Property" },
  { key: "improvement_value", label: "Assessed improvement value", group: "Property" },
  { key: "last_sale_date", label: "Last sale date", group: "Property" },
  { key: "last_sale_price", label: "Last sale price", group: "Property" },
  { key: "owner_name", label: "Owner of record", group: "Owner", required: true },
  { key: "second_owner_name", label: "Second name on title", group: "Owner" },
  { key: "care_of", label: "In care of", group: "Owner" },
  { key: "owner_address", label: "Owner mailing address", group: "Owner" },
  { key: "owner_city", label: "Owner mailing city", group: "Owner" },
  { key: "owner_state", label: "Owner mailing state", group: "Owner" },
  { key: "owner_zip", label: "Owner mailing ZIP", group: "Owner" },
  { key: "owner_phone", label: "Owner phone", group: "Owner" },
] as const;

export type FieldKey = (typeof PROPERTY_OWNER_FIELDS)[number]["key"];
export type Mapping = Partial<Record<FieldKey, string>>;

const SYNONYMS: Record<FieldKey, string[]> = {
  apn: ["apn", "parcelno", "parcel", "parcelnumber", "assessorparcel"],
  street_address: ["bldgaddress", "propertyaddress", "siteaddress", "address", "situsaddress", "streetaddress"],
  city: ["bldgcity", "propertycity", "sitecity", "city", "situscity"],
  zip: ["bldgzip", "propertyzip", "sitezip", "zip", "zipcode", "situszip"],
  units: ["units", "unitcount", "numberofunits", "numunits"],
  year_built: ["yearbuilt", "yrbuilt", "built"],
  floors: ["floors", "stories"],
  construction_type: ["type", "construction", "constructiontype"],
  building_sf: ["buildingsf", "bldgsf", "buildingsize", "sqft", "buildingsqft"],
  lot_sf: ["lotsf", "lotsize", "lotsqft"],
  zoning: ["zoning", "zone"],
  land_value: ["landvalue", "assessedland"],
  improvement_value: ["bldgvalue", "improvementvalue", "improvements", "assessedimprovement"],
  last_sale_date: ["saledate", "lastsaledate", "recordingdate"],
  last_sale_price: ["saleprice", "lastsaleprice"],
  owner_name: ["ownername", "owner1", "ownerofrecord", "owner"],
  second_owner_name: ["secondownername", "owner2", "secondowner"],
  care_of: ["incareof", "careof", "co"],
  owner_address: ["owneraddress", "mailingaddress", "mailaddress"],
  owner_city: ["ownercity", "mailingcity", "mailcity"],
  owner_state: ["ownerstate", "mailingstate", "mailstate"],
  owner_zip: ["ownerzip", "mailingzip", "mailzip"],
  owner_phone: ["ownerphone", "phone", "phonenumber", "telephone"],
};

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Suggest a mapping from headers, using sample values to catch mislabeled columns (e.g. phones under "Owner"). */
export function suggestMapping(headers: string[], sample: Record<string, unknown>[]): Mapping {
  const m: Mapping = {};
  const used = new Set<string>();
  const phoneish = (h: string) => {
    const vals = sample.map((r) => r[h]).filter((v) => v !== null && v !== undefined && v !== "");
    return vals.length > 0 && vals.filter(looksLikePhone).length / vals.length >= 0.75;
  };
  // Phone detection first, so a phone column named "Owner" isn't taken as the owner name
  for (const h of headers) if (phoneish(h)) { m.owner_phone = h; used.add(h); break; }
  for (const f of Object.keys(SYNONYMS) as FieldKey[]) {
    if (m[f]) continue;
    const hit = headers.find((h) => !used.has(h) && SYNONYMS[f].includes(key(h)));
    if (hit) { m[f] = hit; used.add(hit); }
  }
  return m;
}
