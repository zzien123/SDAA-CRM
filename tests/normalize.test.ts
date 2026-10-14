import { test } from "node:test";
import assert from "node:assert/strict";
import { apnKey, apnDisplay, classifyEntity, displayCase, formatPhone, looksLikePhone, normalizeAddress, normalizeName, toDate, zip5 } from "../src/lib/normalize";

test("APN normalization", () => {
  assert.equal(apnKey("638  120 028        1"), "6381200281");
  assert.equal(apnKey("350  580 010"), "350580010");
  assert.equal(apnKey("(760) 344-0888"), null, "phone in APN column is rejected");
  assert.equal(apnKey("565"), null);
  assert.equal(apnDisplay("625  401 011"), "625-401-011");
});

test("addresses", () => {
  assert.equal(normalizeAddress("1251 W Redondo Beach Boulevard, 1st Fl"), "1251 W REDONDO BEACH BLVD 1ST FL");
  assert.equal(normalizeAddress("123 Main Street"), normalizeAddress("123 MAIN ST."));
  assert.equal(displayCase("1023-25 12TH ST"), "1023-25 12th St");
  assert.equal(displayCase("WERBY L L C"), "Werby LLC");
});

test("names and entity types", () => {
  assert.equal(normalizeName("Werby L L C"), "WERBY LLC");
  assert.equal(classifyEntity("WERBY L L C"), "llc");
  assert.equal(classifyEntity("CALE SURVIVORS TRUST"), "trust");
  assert.equal(classifyEntity("SEAWARD LTD."), "limited_partnership");
  assert.equal(classifyEntity("SYBIL C CALE"), "individual");
  assert.equal(classifyEntity("JOHN H 3RD & HOLLY M EATON"), "individual");
  assert.equal(classifyEntity("U S NAVY HOUSING"), "government");
  assert.equal(classifyEntity("BROWN, EST OF LINWOOD R"), "other");
  assert.equal(classifyEntity("EL CAJON SENIOR TOWER APTS"), "unknown");
  assert.equal(classifyEntity("SOUTHERN CALIFORNIA PRESBYTERI"), "nonprofit");
});

test("phones, zips, dates", () => {
  assert.equal(formatPhone("619.555.1212"), "(619) 555-1212");
  assert.equal(formatPhone("555-1212"), null);
  assert.ok(looksLikePhone("(310) 532-6369"));
  assert.equal(zip5(90247.0), "90247");
  assert.equal(zip5("92101-1234"), "92101");
  assert.equal(zip5("2134"), "02134");
  assert.equal(toDate("00-00-1900"), null);
  assert.equal(toDate(new Date(Date.UTC(2012, 3, 12))), "2012-04-12");
  assert.equal(toDate("4/12/2012"), "2012-04-12");
  assert.equal(toDate(41011), "2012-04-12"); // Excel serial
});

test("business names without suffix are not people", () => {
  assert.equal(classifyEntity("BAY APARTMENT COMMUNITIES"), "unknown");
  assert.equal(classifyEntity("REGENTS OF THE UNIV OF CALIF"), "government");
  assert.equal(classifyEntity("LOMA PALISADES LIMITED"), "limited_partnership");
  assert.equal(classifyEntity("FRONT PORCH COMMUNITIES & SVCS"), "unknown");
});

import { firstHouseNumber, inSanDiegoCounty, oneLine, parseCensus, parseNominatim } from "../src/lib/geocode";
test("geocode helpers", () => {
  assert.equal(firstHouseNumber("1023-25 12th St"), "1023 12th St");
  assert.equal(firstHouseNumber("4611-49 Governor Dr"), "4611 Governor Dr");
  assert.equal(firstHouseNumber("901 S Tremont St"), "901 S Tremont St");
  assert.equal(oneLine("232-60 Cottonwood", "San Ysidro", null), "232 Cottonwood, San Ysidro, CA");
  assert.ok(inSanDiegoCounty(33.187, -117.373));
  assert.ok(!inSanDiegoCounty(34.05, -118.24), "Los Angeles rejected");
  assert.deepEqual(parseCensus({ result: { addressMatches: [{ coordinates: { x: -117.373312503141, y: 33.186999157332 }, matchedAddress: "901 S TREMONT ST, OCEANSIDE, CA, 92054" }] } }),
    { lat: 33.186999157332, lng: -117.373312503141, matched: "901 S TREMONT ST, OCEANSIDE, CA, 92054" });
  assert.equal(parseCensus({ result: { addressMatches: [] } }), null);
  assert.equal(parseNominatim([{ lat: "32.7", lon: "-117.1", display_name: "x", type: "house" }])?.precise, true);
});
