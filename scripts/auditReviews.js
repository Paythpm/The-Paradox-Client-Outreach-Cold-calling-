"use strict";
const path = require("path");
const fs = require("fs");
const readline = require("readline");
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });
const { createClient } = require("@supabase/supabase-js");
const supa = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function extractPlaceId(url) {
  if (!url) return null;
  const m = url.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  return m ? m[1].toLowerCase() : null;
}

function parseRating(raw) {
  const m = String(raw || "").match(/([0-9.]+)/);
  return m ? parseFloat(m[1]) : null;
}

// Pain keywords from importReviewsPhase4
const PAIN_KEYWORDS = {
  "Booking & Appointments": ["appointment","schedul","cancel","book","available","rescheduled","slot","no availability","wait weeks","wait months","open slot"],
  "Customer Service": ["rude","unfriendly","unprofessional","unhelpful","attitude","disrespectful","dismissive","ignored","front desk","receptionist"],
  "Pricing & Billing": ["expensive","overpriced","charge","billing","invoice","refund","hidden fee","cost","price","overcharge","insurance","unexpected"],
  "Quality of Work": ["fell out","broken","crown","filling","implant","root canal","bad work","redo","failed","came out","not fixed","still hurts","messed up"],
  "Communication": ["no reply","no response","don't answer","voicemail","email","contact","follow up","not informed","never called back"],
  "Waiting Times": ["wait","waited","waiting","hour wait","delay","slow","45 min","two hours","2 hours","behind schedule","running late","overbooked"],
  "Trust & Transparency": ["lied","mislead","dishonest","scam","fraud","trust","hide","not what was promised","unnecessary treatment"],
  "Facilities": ["dirty","clean","hygiene","facility","parking","outdated","broken equipment","filthy","unclean"],
};

function detectPainCategory(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [cat, kws] of Object.entries(PAIN_KEYWORDS)) {
    if (kws.some(kw => lower.includes(kw))) return cat;
  }
  return null;
}

async function auditFile(filePath, label, placeIdMap) {
  console.log("\n" + "=".repeat(60));
  console.log("FILE: " + label);
  console.log("=".repeat(60));

  let lineNum = 0;
  let tooShort = 0;        // cols < 5 — split URL continuation lines
  let noPlaceId = 0;       // URL has no !1s pattern
  let placeNotInDb = 0;    // PlaceID parsed but not in our businesses table
  let placeInDb = 0;       // PlaceID matched to a business
  let noText = 0;          // review text empty or < 20 chars
  let positiveRating = 0;  // rating > 2.5 — SKIPPED by import
  let negativeRating = 0;  // rating <= 2.5 — KEPT
  let noRating = 0;        // couldn't parse rating
  let noPainCat = 0;       // kept but no pain category match → dropped as __uncategorized__
  let wouldInsertFinal = 0; // would actually be inserted (negative + has category)

  const ratingDist = {};
  const splitSamples = [];
  const noPlaceSamples = [];
  const notInDbSamples = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const rawLine of rl) {
    lineNum++;
    if (lineNum === 1) continue; // header

    // Comma-split (raw, not CSV-quoted — same as importReviewsPhase4 uses)
    const cols = rawLine.split(",");

    if (cols.length < 5) {
      tooShort++;
      if (splitSamples.length < 3) splitSamples.push("Line " + lineNum + " [" + cols.length + " cols]: " + rawLine.substring(0, 100));
      continue;
    }

    const url = cols[1]?.trim();
    const ratingRaw = cols[2]?.trim();
    const reviewText = cols[4]?.trim();

    const placeId = extractPlaceId(url);
    if (!placeId) {
      noPlaceId++;
      if (noPlaceSamples.length < 3) noPlaceSamples.push("Line " + lineNum + " URL: " + (url || "").substring(0, 80));
      continue;
    }

    if (!placeIdMap.has(placeId)) {
      placeNotInDb++;
      if (notInDbSamples.length < 3) notInDbSamples.push(placeId);
      continue;
    }
    placeInDb++;

    if (!reviewText || reviewText.length < 20) { noText++; continue; }

    const rating = parseRating(ratingRaw);
    const rKey = rating !== null ? String(Math.floor(rating)) : "null";
    ratingDist[rKey] = (ratingDist[rKey] || 0) + 1;

    if (rating !== null && rating > 2.5) { positiveRating++; continue; }
    if (rating === null) { noRating++; }
    else { negativeRating++; }

    // Would this get a pain category?
    const cat = detectPainCategory(reviewText);
    if (!cat) { noPainCat++; continue; }
    wouldInsertFinal++;
  }

  const total = lineNum - 1;
  console.log("Total data lines:          " + total.toLocaleString());
  console.log("");
  console.log("--- FILTER FUNNEL ---");
  console.log("1. Split/continuation lines:   " + tooShort.toLocaleString() + "  (" + (tooShort/total*100).toFixed(1) + "%) ← LOST (multiline URL bug)");
  console.log("2. No PlaceID in URL:          " + noPlaceId.toLocaleString() + "  (" + (noPlaceId/total*100).toFixed(1) + "%)");
  console.log("3. PlaceID not in our DB:      " + placeNotInDb.toLocaleString() + "  (" + (placeNotInDb/total*100).toFixed(1) + "%)");
  console.log("4. Matched to a business:      " + placeInDb.toLocaleString() + "  (" + (placeInDb/total*100).toFixed(1) + "%)");
  console.log("5. No review text:             " + noText.toLocaleString());
  console.log("6. Rating > 2.5 (SKIPPED):     " + positiveRating.toLocaleString() + "  ← LOST (positive-only filter)");
  console.log("7. Rating <= 2.5 (negative):   " + negativeRating.toLocaleString());
  console.log("8. No pain category (DROPPED): " + noPainCat.toLocaleString() + "  ← LOST (uncategorized)");
  console.log("9. WOULD BE INSERTED:          " + wouldInsertFinal.toLocaleString() + "  ← final useful reviews");
  console.log("");
  console.log("Rating distribution (matched rows):");
  for (const [k,v] of Object.entries(ratingDist).sort()) {
    console.log("  " + k + " stars: " + v.toLocaleString());
  }
  if (splitSamples.length) {
    console.log("\nSample split lines:");
    splitSamples.forEach(s => console.log("  " + s));
  }
  if (notInDbSamples.length) {
    console.log("\nSample unmatched PlaceIDs:");
    notInDbSamples.forEach(s => console.log("  " + s));
  }
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  DEEP REVIEW PIPELINE AUDIT — Evidence-based analysis        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Load PlaceID map from DB
  console.log("Loading PlaceID → business_id map from DB...");
  const placeIdMap = new Map();
  let from = 0;
  while (true) {
    const { data } = await supa.from("businesses").select("id,place_id").not("place_id","is",null).range(from, from + 999);
    if (!data || data.length === 0) break;
    data.forEach(b => placeIdMap.set(b.place_id.toLowerCase(), b.id));
    from += 1000;
    if (data.length < 1000) break;
  }
  console.log("PlaceIDs in DB: " + placeIdMap.size.toLocaleString());

  // DB stats
  const { count: totalReviews } = await supa.from("business_reviews").select("*",{count:"exact",head:true});
  const { count: totalBiz } = await supa.from("businesses").select("*",{count:"exact",head:true});
  const { count: bizWithReviews } = await supa.from("businesses").select("*",{count:"exact",head:true}).not("place_id","is",null);
  console.log("Total reviews in DB: " + (totalReviews||0).toLocaleString());
  console.log("Total businesses: " + (totalBiz||0).toLocaleString());
  console.log("Businesses with PlaceID: " + (bizWithReviews||0).toLocaleString());

  const filesToCheck = [
    { dir: "phase 4 data maps review", files: ["maps_pain_points_us.csv","maps_pain_points_au.csv","maps_pain_points_ca.csv","maps_pain_points_uk.csv"] },
    { dir: "phase 3 data maps review", files: ["maps_pain_points_au.csv","maps_pain_points_ca.csv","maps_pain_points_uk.csv"] },
    { dir: "phase2 data maps review", files: ["maps_pain_points_us.csv","maps_pain_points_au.csv","maps_pain_points_ca.csv","maps_pain_points_uk.csv"] },
  ];

  for (const { dir, files } of filesToCheck) {
    for (const f of files) {
      const fp = path.join(__dirname, "../../" + dir + "/" + f);
      if (!fs.existsSync(fp)) { console.log("\nSkipping (not found): " + dir + "/" + f); continue; }
      await auditFile(fp, dir + "/" + f, placeIdMap);
    }
  }

  // Also check root-level CSVs
  const rootFiles = [
    "maps_pain_points_phase.csv",
    "maps_pain_points_phase1.csv",
    "maps_pain_points_us phase 1.csv",
    "maps_reviews_seen_phase1.csv",
  ];
  for (const f of rootFiles) {
    const fp = path.join(__dirname, "../../" + f);
    if (!fs.existsSync(fp)) continue;
    await auditFile(fp, "root/" + f, placeIdMap);
  }

  console.log("\n\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  AUDIT COMPLETE                                               ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
}

main().catch(console.error);
