#!/usr/bin/env node
// Seeds fake demo profiles + a couple of already-revealed tastings so the
// People directory and profile stats pages have real content to show.
// Idempotent: re-running skips people/tastings that already exist.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo-people.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceRole) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_PASSWORD = "BlindrDemoPerson123!";

const PEOPLE = [
  {
    key: "isabelle",
    email: "demo.isabelle@blindr.invalid",
    display_name: "Isabelle Moreau",
    bio: "Burgundy obsessive. Mediocre at guessing vintages.",
    skill: 0.75,
  },
  {
    key: "marcus",
    email: "demo.marcus@blindr.invalid",
    display_name: "Marcus Chen",
    bio: "New World enthusiast — can smell an oaked Chardonnay across the room.",
    skill: 0.6,
  },
  {
    key: "sofia",
    email: "demo.sofia@blindr.invalid",
    display_name: "Sofia Andersen",
    bio: "Here for the cheese, staying for the wine.",
    skill: 0.35,
  },
  {
    key: "diego",
    email: "demo.diego@blindr.invalid",
    display_name: "Diego Fernandez",
    bio: "Rioja or nothing.",
    skill: 0.5,
  },
  {
    key: "priya",
    email: "demo.priya@blindr.invalid",
    display_name: "Priya Sharma",
    bio: "Still learning to spit instead of swallow.",
    skill: 0.45,
  },
];

async function ensurePerson(person) {
  const { data: existing } = await admin.auth.admin.listUsers();
  let user = existing.users.find((u) => u.email === person.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    console.log(`Created ${person.display_name} (${user.id})`);
  }
  await admin
    .from("profiles")
    .update({ display_name: person.display_name, bio: person.bio })
    .eq("id", user.id);
  return { ...person, id: user.id };
}

async function findRefByName(table, name, filter) {
  let query = admin.from(table).select("id, name").ilike("name", name).limit(1);
  if (filter) query = filter(query);
  const { data } = await query;
  if (data && data.length > 0) return data[0];
  // Not found by name — fall back to any row, but keep the same scoping
  // filter (e.g. region_id) if one was given, so an appellation fallback
  // stays in the right region instead of picking something unrelated.
  let fallbackQuery = admin.from(table).select("id, name").limit(1);
  if (filter) fallbackQuery = filter(fallbackQuery);
  const { data: fallback } = await fallbackQuery;
  return fallback[0];
}

function pickWrong(pool, correctId) {
  const candidates = pool.filter((r) => r.id !== correctId);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0];
}

async function ensureTasting({ name, hostId, participantIds, wines }) {
  const { data: existing } = await admin
    .from("tastings")
    .select("id")
    .eq("name", name)
    .eq("host_id", hostId)
    .maybeSingle();
  if (existing) {
    console.log(`Tasting "${name}" already exists, skipping.`);
    return existing.id;
  }

  const { data: tasting, error } = await admin
    .from("tastings")
    .insert({
      name,
      host_id: hostId,
      timing_mode: "ASYNC",
      wine_source: "HOST_PROVIDES",
      reveal_mode: "BLIND",
      status: "CLOSED",
    })
    .select()
    .single();
  if (error) throw error;

  const participantByUserId = new Map();
  for (const userId of participantIds) {
    const { data: p, error: pErr } = await admin
      .from("tasting_participants")
      .insert({
        tasting_id: tasting.id,
        user_id: userId,
        status: "JOINED",
        joined_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (pErr) throw pErr;
    participantByUserId.set(userId, p);
  }

  const wineIds = [];
  for (const [i, wineSpec] of wines.entries()) {
    const { data: wine, error: wErr } = await admin
      .from("wines")
      .insert({ tasting_id: tasting.id, position: i + 1 })
      .select()
      .single();
    if (wErr) throw wErr;

    const { error: aErr } = await admin.from("wine_answers").insert({
      wine_id: wine.id,
      country_id: wineSpec.country.id,
      region_id: wineSpec.region.id,
      appellation_id: wineSpec.appellation.id,
      primary_grape_id: wineSpec.grape.id,
      producer_id: wineSpec.producer.id,
      vintage_kind: "YEAR",
      vintage_year: wineSpec.year,
    });
    if (aErr) throw aErr;

    wineIds.push({ id: wine.id, spec: wineSpec });
  }

  // Guesses: each participant guesses each wine, each category independently
  // correct with probability = their "skill", for a realistic score spread.
  for (const userId of participantIds) {
    const person = PEOPLE.find((p) => p.id === userId);
    const skill = person?.skill ?? 0.5;
    const participant = participantByUserId.get(userId);
    for (const { id: wineId, spec } of wineIds) {
      const roll = () => Math.random() < skill;
      const countryId = roll() ? spec.country.id : pickWrong(spec.countryPool, spec.country.id).id;
      const regionId = roll() ? spec.region.id : pickWrong(spec.regionPool, spec.region.id).id;
      const appellationId = roll()
        ? spec.appellation.id
        : pickWrong(spec.appellationPool, spec.appellation.id).id;
      const grapeId = roll() ? spec.grape.id : pickWrong(spec.grapePool, spec.grape.id).id;
      const producerId = roll()
        ? spec.producer.id
        : pickWrong(spec.producerPool, spec.producer.id).id;
      let vintageYear = spec.year;
      if (!roll()) {
        vintageYear = roll() ? spec.year + (Math.random() < 0.5 ? 1 : -1) : spec.year + 5;
      }

      const { error } = await admin.from("guesses").insert({
        wine_id: wineId,
        participant_id: participant.id,
        country_id: countryId,
        region_id: regionId,
        appellation_id: appellationId,
        primary_grape_id: grapeId,
        producer_id: producerId,
        vintage_kind: "YEAR",
        vintage_year: vintageYear,
      });
      if (error) throw error;
    }
  }

  console.log(`Created tasting "${name}" with ${wines.length} wines, ${participantIds.length} participants.`);
  return { id: tasting.id, wineIds: wineIds.map((w) => w.id) };
}

async function revealAllWines(hostEmail, wineIds) {
  const client = createClient(url, anonKey);
  const { error: signInError } = await client.auth.signInWithPassword({
    email: hostEmail,
    password: DEMO_PASSWORD,
  });
  if (signInError) throw signInError;
  for (const wineId of wineIds) {
    const { error } = await client.rpc("reveal_wine", { p_wine_id: wineId });
    if (error) console.error(`  reveal failed for ${wineId}:`, error.message);
  }
  await client.auth.signOut();
}

// --- main ---
const people = {};
for (const p of PEOPLE) {
  people[p.key] = await ensurePerson(p);
}
for (const p of PEOPLE) PEOPLE.find((x) => x.key === p.key).id = people[p.key].id;

const countryPool = (await admin.from("countries").select("id, name").limit(50)).data;
const regionPool = (await admin.from("regions").select("id, name").limit(50)).data;
const appellationPool = (await admin.from("appellations").select("id, name").limit(50)).data;
const grapePool = (await admin.from("grapes").select("id, name").limit(50)).data;
const producerPool = (await admin.from("producers").select("id, name").limit(50)).data;

async function buildWine(countryName, regionName, appellationName, grapeName, producerName, year) {
  const country = await findRefByName("countries", countryName);
  const region = await findRefByName("regions", regionName);
  const appellation = await findRefByName("appellations", appellationName, (q) =>
    q.eq("region_id", region.id),
  );
  const grape = await findRefByName("grapes", grapeName);
  const producer = await findRefByName("producers", producerName);
  return {
    country,
    region,
    appellation,
    grape,
    producer,
    year,
    countryPool,
    regionPool,
    appellationPool,
    grapePool,
    producerPool,
  };
}

const bordeauxWines = [
  await buildWine("France", "Bordeaux", "Pauillac", "Cabernet Sauvignon", "Château Palmer", 2015),
  await buildWine("France", "Bourgogne", "Vosne-Romanée", "Pinot Noir", "Domaine Leroy", 2018),
  await buildWine("Italy", "Piemonte", "Barolo", "Nebbiolo", "Gaja", 2016),
];

const newWorldWines = [
  await buildWine("United States", "California", "Napa Valley", "Cabernet Sauvignon", "Opus One", 2017),
  await buildWine("Australia", "South Australia", "Barossa Valley", "Shiraz", "Penfolds", 2019),
  await buildWine("Argentina", "Mendoza", "Mendoza", "Malbec", "Achaval-Ferrer", 2018),
];

console.log("\nBordeaux Classics wines:", bordeauxWines.map((w) => `${w.appellation.name}/${w.producer.name}`));
console.log("New World Nights wines:", newWorldWines.map((w) => `${w.appellation.name}/${w.producer.name}`));

const tastingA = await ensureTasting({
  name: "Bordeaux Classics",
  hostId: people.isabelle.id,
  participantIds: [people.isabelle.id, people.marcus.id, people.diego.id, people.sofia.id],
  wines: bordeauxWines,
});
if (tastingA.wineIds) await revealAllWines(people.isabelle.email, tastingA.wineIds);

const tastingB = await ensureTasting({
  name: "New World Nights",
  hostId: people.marcus.id,
  participantIds: [people.marcus.id, people.isabelle.id, people.diego.id, people.priya.id],
  wines: newWorldWines,
});
if (tastingB.wineIds) await revealAllWines(people.marcus.email, tastingB.wineIds);

console.log("\nDone.");
