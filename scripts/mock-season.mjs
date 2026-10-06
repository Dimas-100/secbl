// Mock season for walkthroughs: 20 members across the five schools, eight
// weeks of confirmed matches rated with the real formula, pending and
// disputed reports, events with RSVPs, a tournament ready to start, and chat.
//
//   node scripts/mock-season.mjs seed    # idempotent: refuses if mock data exists
//   node scripts/mock-season.mjs clean   # removes everything it created
//
// Runs against the project in .env.local — the same database production
// uses — so every row is tagged: mock emails end in @mock.secbl.app, and a
// manifest in %LOCALAPPDATA%\secbl-mock records the rest. Real members'
// rating and matches_played are snapshotted and restored on clean.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
const require = createRequire(path.join(process.cwd(), "/"));
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const MODE = process.argv[2];
if (!["seed", "clean"].includes(MODE)) {
  console.error("usage: node scripts/mock-season.mjs seed|clean");
  process.exit(1);
}
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const MOCK_DOMAIN = "mock.secbl.app";
const manifestDir = path.join(process.env.LOCALAPPDATA ?? os.homedir(), "secbl-mock");
const manifestPath = path.join(manifestDir, "manifest.json");
// The mock accounts can log in to production, so their shared password is
// never in the repo: generated per seed (or taken from MOCK_PASSWORD) and
// recorded only in the local manifest.
const MOCK_PASSWORD =
  process.env.MOCK_PASSWORD ??
  `mock-${Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("")}`;

// Deterministic randomness so the season reads the same every run.
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261006);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;

// Real rating engine (lib/rating.ts), replicated so deltas match exactly.
const expected = (a, b) => 1 / (1 + Math.pow(2, (b - a) / 100));
const kFor = (played) => (played < 10 ? 64 : 32);
const update = (r, opp, won, played) => {
  const delta = Math.round(kFor(played) * ((won ? 1 : 0) - expected(r, opp)));
  return { delta, after: Math.max(100, r + delta) };
};

const MEMBERS = [
  // name, school, skill (hidden), ball, tagline, favourite
  ["Maya Chen", "GSU", 620, 9, "Stripes only.", "9ball"],
  ["Jordan Reyes", "GSU", 540, 2, "Bank shots are a lifestyle.", "8ball"],
  ["Priya Natarajan", "GSU", 470, 4, null, "9ball"],
  ["Tyler Brooks", "GSU", 430, null, "Still learning the break.", "8ball"],
  ["Sofia Alvarez", "UGA", 600, 3, "Run out or bust.", "9ball"],
  ["Marcus Hill", "UGA", 560, 8, "Eight ball, corner pocket.", "8ball"],
  ["Hannah Kim", "UGA", 480, 12, null, "10ball"],
  ["Elijah Carter", "UGA", 440, null, "Here for the trash talk.", "8ball"],
  ["Noah Williams", "FSU", 585, 6, "Garnet and gold, baby.", "9ball"],
  ["Ava Thompson", "FSU", 530, 11, "Safeties win matches.", "9ball"],
  ["Lucas Ferreira", "FSU", 465, 5, null, "8ball"],
  ["Zoe Patel", "FSU", 420, 14, "New to the league, old to the game.", "8ball"],
  ["Owen Mitchell", "KSU", 570, 1, "Yellow ball energy.", "9ball"],
  ["Isabella Rossi", "KSU", 515, 7, "Patience is a weapon.", "10ball"],
  ["Caleb Nguyen", "KSU", 455, 13, null, "8ball"],
  ["Grace Okafor", "KSU", 435, null, "Jump cue enjoyer.", "9ball"],
  ["Ethan Park", "GT", 610, 15, "Geometry homework, but fun.", "9ball"],
  ["Lily Johnson", "GT", 545, 10, "Will travel for a 9-footer.", "9ball"],
  ["Diego Morales", "GT", 475, 3, null, "8ball"],
  ["Chloe Bennett", "GT", 425, 6, "Three cushions, no excuses.", "other"],
];

const emailFor = (name) => `${name.toLowerCase().replace(/[^a-z ]/g, "").replace(/ /g, ".")}@${MOCK_DOMAIN}`;

const CLUB_OFFSET_HOURS = 4; // EDT in October; close enough for mock timestamps.
// "Day 0" is today's date on the club clock, not UTC — after 8pm Eastern the
// UTC date is already tomorrow, which would push "today's" matches into the
// future and above the Today group in the feed.
function atClub(daysAgo, hour, minute = 0) {
  const clubNow = new Date(Date.now() - CLUB_OFFSET_HOURS * 3600_000);
  const d = new Date(Date.UTC(clubNow.getUTCFullYear(), clubNow.getUTCMonth(), clubNow.getUTCDate() - daysAgo));
  d.setUTCHours(hour + CLUB_OFFSET_HOURS, minute, 0, 0);
  return d;
}
const clubDate = (d) => new Date(d.getTime() - CLUB_OFFSET_HOURS * 3600_000).toISOString().slice(0, 10);

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

async function seed() {
  if (fs.existsSync(manifestPath)) {
    console.error(`mock data already present (${manifestPath}). Run clean first.`);
    process.exit(1);
  }
  const schools = await must(service.from("schools").select("id, short_name"), "schools");
  const schoolId = Object.fromEntries(schools.map((s) => [s.short_name, s.id]));
  const real = await must(
    service.from("profiles").select("id, display_name, role, rating, matches_played, school_id").eq("status", "approved"),
    "real members"
  );
  const admin = real.find((p) => p.role === "admin");
  if (!admin) throw new Error("no admin profile to own events and the tournament");
  const manifest = {
    createdAt: new Date().toISOString(),
    password: MOCK_PASSWORD,
    realSnapshot: real,
    mockIds: [],
    eventIds: [],
    tournamentId: null,
    dmChannelIds: [],
  };
  const save = () => {
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  };

  // 1. Members
  const mocks = [];
  for (const [name, school, skill, ball, tagline, fav] of MEMBERS) {
    const { data, error } = await service.auth.admin.createUser({
      email: emailFor(name),
      password: MOCK_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: name, school_id: schoolId[school] },
    });
    if (error) throw new Error(`create ${name}: ${error.message}`);
    const id = data.user.id;
    manifest.mockIds.push(id);
    save();
    await must(
      service.from("profiles").update({ status: "approved", ball, tagline, favorite_game: fav }).eq("id", id),
      `approve ${name}`
    );
    mocks.push({ id, name, school, skill, rating: 450, played: 0 });
  }
  console.log(`members: ${mocks.length}`);

  // Real members join the season too (restored on clean).
  const everyone = [
    ...mocks,
    ...real.map((p) => ({
      id: p.id,
      name: p.display_name,
      school: schools.find((s) => s.id === p.school_id)?.short_name,
      skill: 500,
      rating: p.rating,
      played: p.matches_played,
      real: true,
    })),
  ];

  // 2. Eight weeks of confirmed matches
  let confirmed = 0;
  for (let day = 56; day >= 0; day--) {
    const games = day === 0 ? 1 : chance(0.25) ? 0 : chance(0.6) ? 1 : 2;
    for (let g = 0; g < games; g++) {
      const a = pick(everyone);
      const sameSchool = everyone.filter((p) => p.id !== a.id && p.school === a.school);
      const pool = chance(0.7) && sameSchool.length ? sameSchool : everyone.filter((p) => p.id !== a.id);
      const b = pick(pool);
      if (!b) continue;
      const pA = 1 / (1 + Math.pow(2, (b.skill - a.skill) / 100));
      const aWins = chance(pA);
      const game = pick(["8ball", "8ball", "9ball", "9ball", "10ball", "other"]);
      const race = game === "9ball" ? 7 : 5;
      const loserScore = Math.floor(rand() * race);
      const when = atClub(day, 18 + Math.floor(rand() * 5), Math.floor(rand() * 60));
      const match = await must(
        service
          .from("matches")
          .insert({
            reporter_id: a.id,
            opponent_id: b.id,
            winner_id: aWins ? a.id : b.id,
            reporter_score: aWins ? race : loserScore,
            opponent_score: aWins ? loserScore : race,
            game_type: game,
            played_at: clubDate(when),
          })
          .select("id")
          .single(),
        "insert match"
      );
      const ra = update(a.rating, b.rating, aWins, a.played);
      const rb = update(b.rating, a.rating, !aWins, b.played);
      await must(
        service.rpc("apply_match_confirmation", { p_match_id: match.id, p_reporter_delta: ra.delta, p_opponent_delta: rb.delta }),
        "confirm"
      );
      a.rating = ra.after;
      b.rating = rb.after;
      a.played += 1;
      b.played += 1;
      const ts = when.toISOString();
      await must(service.from("matches").update({ confirmed_at: ts, created_at: ts }).eq("id", match.id), "backdate match");
      await must(service.from("rating_history").update({ created_at: ts }).eq("match_id", match.id), "backdate history");
      confirmed += 1;
    }
  }
  console.log(`confirmed matches: ${confirmed}`);

  // 3. Open reports: one for the admin to confirm, one the admin is waiting
  //    on, one dispute for the admin queue.
  const gsu = mocks.filter((m) => m.school === "GSU");
  await must(
    service.from("matches").insert({
      reporter_id: gsu[1].id,
      opponent_id: admin.id,
      winner_id: gsu[1].id,
      reporter_score: 5,
      opponent_score: 3,
      game_type: "8ball",
      played_at: clubDate(atClub(0, 20)),
    }),
    "pending vs admin"
  );
  await must(
    service.from("matches").insert({
      reporter_id: admin.id,
      opponent_id: gsu[2].id,
      winner_id: admin.id,
      reporter_score: 7,
      opponent_score: 5,
      game_type: "9ball",
      played_at: clubDate(atClub(1, 19)),
    }),
    "pending by admin"
  );
  await must(
    service.from("matches").insert({
      reporter_id: mocks[8].id,
      opponent_id: mocks[9].id,
      winner_id: mocks[8].id,
      reporter_score: 7,
      opponent_score: 6,
      game_type: "9ball",
      played_at: clubDate(atClub(2, 21)),
      status: "disputed",
    }),
    "disputed"
  );

  // 4. Events
  const nextThursday = (() => {
    const d = atClub(0, 19);
    while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  })();
  const events = [
    { title: "Thursday Club Night", location: "Rack Room, GSU Student Center", starts: nextThursday, hours: 3,
      description: "Open tables from 7. Bring a friend, report your matches in the app before you leave." },
    { title: "SEC Invitational", location: "Buckhead Billiards, Atlanta", starts: atClub(-16, 12), hours: 8,
      description: "All five schools. Fall Classic bracket runs here — sign up in Cups." },
    { title: "Season Opener", location: "Rack Room, GSU Student Center", starts: atClub(20, 19), hours: 3,
      description: "First night of the fall season." },
  ];
  const eventIds = {};
  for (const e of events) {
    const row = await must(
      service.from("events").insert({
        title: e.title,
        description: e.description,
        location: e.location,
        starts_at: e.starts.toISOString(),
        ends_at: new Date(e.starts.getTime() + e.hours * 3600_000).toISOString(),
        created_by: admin.id,
      }).select("id").single(),
      `event ${e.title}`
    );
    eventIds[e.title] = row.id;
    manifest.eventIds.push(row.id);
    save();
    const rsvps = mocks
      .filter(() => chance(0.65))
      .map((m) => ({ event_id: row.id, profile_id: m.id, response: chance(0.75) ? "going" : chance(0.6) ? "maybe" : "no" }));
    if (rsvps.length) await must(service.from("rsvps").insert(rsvps), "rsvps");
  }
  console.log(`events: ${events.length}`);

  // 5. Tournament in setup, top eight by rating, linked to the Invitational
  const tournament = await must(
    service.from("tournaments").insert({ name: "Fall Classic", event_id: eventIds["SEC Invitational"], created_by: admin.id }).select("id").single(),
    "tournament"
  );
  manifest.tournamentId = tournament.id;
  save();
  const top8 = [...mocks].sort((x, y) => y.rating - x.rating).slice(0, 8);
  await must(
    service.from("tournament_players").insert(top8.map((m, i) => ({ tournament_id: tournament.id, profile_id: m.id, seed: i + 1 }))),
    "entrants"
  );

  // 6. Chat
  const channels = await must(service.from("channels").select("id, type, school_id"), "channels");
  const everyoneRoom = channels.find((c) => c.type === "everyone");
  const gsuRoom = channels.find((c) => c.type === "school" && c.school_id === schoolId.GSU);
  const byName = Object.fromEntries(mocks.map((m) => [m.name, m]));
  const say = async (channel, who, body, daysAgo, hour, minute) => {
    const row = await must(
      service.from("messages").insert({ channel_id: channel.id, sender_id: who.id, body }).select("id").single(),
      "message"
    );
    await must(service.from("messages").update({ created_at: atClub(daysAgo, hour, minute).toISOString() }).eq("id", row.id), "backdate message");
  };
  const feed = [
    ["Sofia Alvarez", "who's coming to club night thursday? UGA is bringing six", 3, 12, 4],
    ["Marcus Hill", "seven if elijah actually shows", 3, 12, 9],
    ["Elijah Carter", "I will be there and I will be loud", 3, 12, 15],
    ["Maya Chen", "GSU will be there. tables 3 and 4 are ours 🎱", 3, 13, 2],
    ["Ethan Park", "Fall Classic signups are open in Cups — top 8 by rating as of friday", 2, 9, 30],
    ["Noah Williams", "FSU is driving up saturday. anyone know if Buckhead has 9-footers?", 2, 15, 12],
    ["Owen Mitchell", "four of them, back room. bring quarters for the practice tables", 2, 15, 40],
    ["Lily Johnson", "that 7–6 between noah and ava last night 😮‍💨", 1, 22, 5],
    ["Ava Thompson", "we're sorting that one out with the admins lol", 1, 22, 11],
    ["Jordan Reyes", "new personal best tonight, 5–0. the stripes were kind", 0, 21, 48],
    ["Priya Natarajan", "report it before you forget!!", 0, 21, 52],
    ["Isabella Rossi", "GL everyone this weekend. see you at the Invitational", 0, 22, 30],
  ];
  for (const [who, body, d, h, m] of feed) await say(everyoneRoom, byName[who], body, d, h, m);
  const gsuChat = [
    ["Maya Chen", "practice tomorrow at 6? I want to work on the break before saturday", 1, 17, 0],
    ["Tyler Brooks", "yes please. my break is a rumour", 1, 17, 6],
    ["Jordan Reyes", "I'll bring the training balls", 1, 17, 20],
    ["Priya Natarajan", "in. someone message Dimas about table time", 1, 17, 25],
  ];
  for (const [who, body, d, h, m] of gsuChat) await say(gsuRoom, byName[who], body, d, h, m);

  // A DM waiting for the admin, so the inbox badge lights up.
  const maya = byName["Maya Chen"];
  const key = [maya.id, admin.id].sort().join(":");
  const dm = await must(
    service.from("channels").insert({ type: "dm", name: "Direct message", dm_key: key }).select("id").single(),
    "dm channel"
  );
  manifest.dmChannelIds.push(dm.id);
  save();
  await must(
    // A batch insert sends the union of keys, so a row missing one gets null.
    service.from("channel_members").insert([
      { channel_id: dm.id, profile_id: maya.id, last_read_at: new Date().toISOString() },
      { channel_id: dm.id, profile_id: admin.id, last_read_at: atClub(1, 0).toISOString() },
    ]),
    "dm members"
  );
  await say({ id: dm.id }, maya, "hey — can GSU get tables 3 and 4 reserved for thursday? we have 6 coming", 0, 16, 10);
  await say({ id: dm.id }, maya, "also I think the 9–7 I reported against Jordan is still pending on his end", 0, 16, 12);
  console.log("chat seeded");

  console.log(`\nDone. Log in as any mock member with password ${MOCK_PASSWORD}, e.g. ${emailFor("Maya Chen")}`);
  console.log(`Manifest: ${manifestPath}`);
}

async function clean() {
  if (!fs.existsSync(manifestPath)) {
    console.error("no manifest found; nothing to clean");
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const ids = manifest.mockIds;
  // Matches and history involving any mock member (including those with real members).
  for (const id of ids) {
    const { data: ms } = await service.from("matches").select("id").or(`reporter_id.eq.${id},opponent_id.eq.${id}`);
    const matchIds = (ms ?? []).map((m) => m.id);
    if (matchIds.length) {
      await must(service.from("rating_history").delete().in("match_id", matchIds), "history");
      await must(service.from("matches").delete().in("id", matchIds), "matches");
    }
  }
  if (manifest.tournamentId) await must(service.from("tournaments").delete().eq("id", manifest.tournamentId), "tournament");
  if (manifest.eventIds.length) await must(service.from("events").delete().in("id", manifest.eventIds), "events");
  for (const c of manifest.dmChannelIds) await must(service.from("channels").delete().eq("id", c), "dm");
  for (const id of ids) {
    await service.from("channels").delete().eq("type", "dm").like("dm_key", `%${id}%`);
    const { data: files } = await service.storage.from("avatars").list(id);
    if (files?.length) await service.storage.from("avatars").remove(files.map((f) => `${id}/${f.name}`));
    const { error } = await service.auth.admin.deleteUser(id);
    if (error && !/not found/i.test(error.message)) throw new Error(`delete user: ${error.message}`);
  }
  for (const p of manifest.realSnapshot) {
    await must(
      service.from("profiles").update({ rating: p.rating, matches_played: p.matches_played }).eq("id", p.id),
      "restore real member"
    );
  }
  fs.unlinkSync(manifestPath);
  console.log(`cleaned ${ids.length} mock members and everything they touched; real members restored`);
}

await (MODE === "seed" ? seed() : clean());
