"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SchoolMark } from "@/components/school-mark";
import { createClient } from "@/lib/supabase/client";
import { setSchoolLogo } from "./actions";

export interface SchoolLogoRow {
  id: string;
  name: string;
  short_name: string;
  primary_color: string | null;
  logo_url: string | null;
}

const MAX_BYTES = 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

// One row per school: the mark, the name, upload/replace/remove. The file
// goes straight to Storage from the browser (admins may write the bucket),
// then the server action records the URL through the admin-only RPC.
export function SchoolLogoUploader({ schools }: { schools: SchoolLogoRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  function storagePathOf(url: string | null): string | null {
    if (!url) return null;
    const marker = "/storage/v1/object/public/school-logos/";
    const i = url.indexOf(marker);
    return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
  }

  async function onPick(school: SchoolLogoRow, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = TYPES[file.type];
    if (!ext) {
      setError("Use a PNG, SVG, WebP or JPEG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Keep the logo under 1 MB.");
      return;
    }
    setBusy(school.id);
    setError(null);
    try {
      const supabase = createClient();
      const path = `${school.id}/logo-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("school-logos")
        .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: true });
      if (upErr) throw upErr;
      const {
        data: { publicUrl },
      } = supabase.storage.from("school-logos").getPublicUrl(path);
      const result = await setSchoolLogo(school.id, publicUrl);
      if (result.error) throw new Error(result.error);
      const old = storagePathOf(school.logo_url);
      if (old) void supabase.storage.from("school-logos").remove([old]);
      router.refresh();
    } catch (err) {
      console.error("school logo upload failed", err);
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(school: SchoolLogoRow) {
    setBusy(school.id);
    setError(null);
    const result = await setSchoolLogo(school.id, null);
    if (result.error) {
      setError(result.error);
    } else {
      const old = storagePathOf(school.logo_url);
      if (old) void createClient().storage.from("school-logos").remove([old]);
      router.refresh();
    }
    setBusy(null);
  }

  return (
    <div className="flex flex-col">
      {schools.map((s) => (
        <div key={s.id} className="border-hairline-row flex items-center gap-3 border-b py-3 last:border-b-0">
          <SchoolMark school={s} size={28} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-medium">{s.short_name}</span>
            <span className="text-muted-foreground truncate text-[12px]">{s.name}</span>
          </span>
          <input
            ref={(el) => {
              inputs.current[s.id] = el;
            }}
            type="file"
            accept="image/png,image/svg+xml,image/webp,image/jpeg"
            onChange={(e) => void onPick(s, e)}
            className="sr-only"
            aria-label={`Choose a logo for ${s.short_name}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => inputs.current[s.id]?.click()}
          >
            {busy === s.id ? "Working…" : s.logo_url ? "Replace" : "Upload"}
          </Button>
          {s.logo_url && (
            <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => void onRemove(s)}>
              Remove
            </Button>
          )}
        </div>
      ))}
      {error && (
        <p role="alert" className="bg-destructive/10 text-destructive mt-3 rounded-2xl p-3 text-sm">
          {error}
        </p>
      )}
      <p className="text-muted-foreground pt-3 text-xs">
        PNG, SVG, WebP or JPEG under 1 MB. Shown on the leaderboard, profiles and the school room.
      </p>
    </div>
  );
}
