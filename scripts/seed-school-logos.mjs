// Seeds the five schools' official marks from Wikimedia Commons into the
// school-logos bucket and points schools.logo_url at them.
//
//   node scripts/seed-school-logos.mjs            # skips schools that already have a logo
//   node scripts/seed-school-logos.mjs --force    # replaces them
//
// Best effort: a school whose download fails is reported and left on its
// colour dot; an admin can upload one from the Admin screen instead. Runs
// against the project in .env.local with the service key.
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(path.join(process.cwd(), "/"));
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const FORCE = process.argv.includes("--force");
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// short_name → Commons file title (the schools' primary athletics marks).
const FILES = {
  UGA: "Georgia Athletics logo.svg",
  GSU: "Georgia State University Logo.svg",
  FSU: "Florida State Seminoles alternate logo.svg",
  KSU: "Kennesaw State Owls logo.svg",
  GT: "Georgia Tech Yellow Jackets logo.svg",
};
const UA = "SECBL/1.0 (club app logo seed; https://secbl.vercel.app)";

async function commonsUrl(title) {
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  api.searchParams.set("action", "query");
  api.searchParams.set("titles", `File:${title}`);
  api.searchParams.set("prop", "imageinfo");
  api.searchParams.set("iiprop", "url|mime");
  api.searchParams.set("format", "json");
  const res = await fetch(api, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`commons api ${res.status}`);
  const json = await res.json();
  const page = Object.values(json.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info?.url) throw new Error(`no file for ${title}`);
  return { url: info.url, mime: info.mime };
}

const { data: schools, error } = await service.from("schools").select("id, short_name, logo_url");
if (error) throw error;
for (const s of schools) {
  const title = FILES[s.short_name];
  if (!title) {
    console.log(`${s.short_name}: no source mapped, skipped`);
    continue;
  }
  if (s.logo_url && !FORCE) {
    console.log(`${s.short_name}: already has a logo, skipped`);
    continue;
  }
  try {
    const { url, mime } = await commonsUrl(title);
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const ext = mime === "image/svg+xml" ? "svg" : mime === "image/png" ? "png" : "img";
    const objectPath = `${s.id}/logo.${ext}`;
    const { error: upErr } = await service.storage
      .from("school-logos")
      .upload(objectPath, bytes, { contentType: mime, cacheControl: "31536000", upsert: true });
    if (upErr) throw upErr;
    const {
      data: { publicUrl },
    } = service.storage.from("school-logos").getPublicUrl(objectPath);
    const { error: setErr } = await service.from("schools").update({ logo_url: publicUrl }).eq("id", s.id);
    if (setErr) throw setErr;
    console.log(`${s.short_name}: ${(bytes.length / 1024).toFixed(0)} KB ${mime} → ${publicUrl}`);
  } catch (err) {
    console.log(`${s.short_name}: FAILED — ${err.message}`);
  }
}
