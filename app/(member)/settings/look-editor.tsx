"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/client";
import { BALLS, GAME_LABEL, ballStyle } from "@/lib/identity";
import { cn } from "@/lib/utils";
import { setAvatarUrl, updateProfilePrefs } from "./actions";

const AVATAR_SIZE = 512;

// Everything about how you appear to the league: photo, ball, tagline,
// favourite game. The photo is cropped square and shrunk in the browser so
// a 12 MB phone picture becomes a 60 KB upload.
export function LookEditor({
  profileId,
  displayName,
  avatarUrl,
  ball,
  tagline,
  favoriteGame,
}: {
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
  ball: number | null;
  tagline: string | null;
  favoriteGame: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [chosenBall, setChosenBall] = useState<number | null>(ball);
  const [taglineDraft, setTaglineDraft] = useState(tagline ?? "");

  async function squareJpeg(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE
    );
    bitmap.close();
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode image"))), "image/jpeg", 0.86)
    );
  }

  function storagePathOf(url: string | null): string | null {
    if (!url) return null;
    const marker = "/storage/v1/object/public/avatars/";
    const i = url.indexOf(marker);
    return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Choose a photo (JPEG, PNG or WebP).");
      return;
    }
    setBusy("upload");
    setPhotoError(null);
    try {
      const blob = await squareJpeg(file);
      const supabase = createClient();
      const path = `${profileId}/avatar-${crypto.randomUUID().slice(0, 8)}.jpg`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (error) throw error;
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);
      const result = await setAvatarUrl(publicUrl);
      if (result.error) throw new Error(result.error);
      const old = storagePathOf(avatarUrl);
      if (old) void supabase.storage.from("avatars").remove([old]);
      router.refresh();
    } catch (err) {
      // The friendly line is for the member; the raw one is for whoever is
      // helping them.
      console.error("avatar upload failed", err);
      setPhotoError(err instanceof Error ? friendly(err.message) : "Upload failed. Try another photo.");
    } finally {
      setBusy(null);
    }
  }

  async function onRemove() {
    setBusy("remove");
    setPhotoError(null);
    const result = await setAvatarUrl(null);
    if (result.error) {
      setPhotoError(result.error);
    } else {
      const old = storagePathOf(avatarUrl);
      if (old) void createClient().storage.from("avatars").remove([old]);
      router.refresh();
    }
    setBusy(null);
  }

  const preview = { id: profileId, display_name: displayName, avatar_url: avatarUrl, ball: chosenBall };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar person={preview} size="xl" />
        <div className="flex min-w-0 flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPick}
            className="sr-only"
            aria-label="Choose a profile photo"
          />
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={busy !== null}
            onClick={() => fileRef.current?.click()}
          >
            <Camera className="size-4" />
            {busy === "upload" ? "Uploading…" : avatarUrl ? "Change photo" : "Add a photo"}
          </Button>
          {avatarUrl && (
            <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={onRemove}>
              <Trash2 className="size-4" />
              {busy === "remove" ? "Removing…" : "Remove photo"}
            </Button>
          )}
          <p className="text-muted-foreground text-xs">
            Cropped to a square. Without a photo, your ball shows instead.
          </p>
        </div>
      </div>
      {photoError && (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">
          {photoError}
        </p>
      )}

      <form action={updateProfilePrefs} className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Your ball</legend>
          <p className="text-muted-foreground text-xs">
            The colour behind your initial everywhere you appear.
          </p>
          <div className="grid grid-cols-8 gap-2">
            {BALLS.map((b) => {
              const selected = chosenBall === b.number;
              return (
                <label
                  key={b.number}
                  className={cn(
                    "press relative flex aspect-square cursor-pointer items-center justify-center rounded-full text-xs font-extrabold",
                    selected && "ring-primary ring-2 ring-offset-2 ring-offset-card"
                  )}
                  style={ballStyle(b)}
                  title={`${b.number} ${b.name}`}
                >
                  <input
                    type="radio"
                    name="ball"
                    value={b.number}
                    checked={selected}
                    onChange={() => setChosenBall(b.number)}
                    className="sr-only"
                  />
                  <span className="bg-foreground text-background flex size-4 items-center justify-center rounded-full text-[9px]">
                    {b.number}
                  </span>
                </label>
              );
            })}
            <label
              className={cn(
                "press border-muted-foreground/40 text-muted-foreground flex aspect-square cursor-pointer items-center justify-center rounded-full border border-dashed text-[9px] font-semibold",
                chosenBall === null && "ring-primary ring-2 ring-offset-2 ring-offset-card"
              )}
              title="Let the app pick"
            >
              <input
                type="radio"
                name="ball"
                value=""
                checked={chosenBall === null}
                onChange={() => setChosenBall(null)}
                className="sr-only"
              />
              Auto
            </label>
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tagline">Tagline</Label>
          <Input
            id="tagline"
            name="tagline"
            maxLength={60}
            value={taglineDraft}
            onChange={(e) => setTaglineDraft(e.target.value)}
            placeholder="Breaks and runs. Mostly runs."
          />
          <p className="text-muted-foreground text-right text-xs">{taglineDraft.length}/60</p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Favourite game</legend>
          <div className="bg-muted flex rounded-xl p-1">
            {[["", "None"], ...Object.entries(GAME_LABEL)].map(([value, label]) => (
              <label
                key={value}
                className="press has-checked:bg-card flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg text-xs font-semibold has-checked:font-bold has-checked:shadow-[inset_0_0_0_1px_var(--hairline-row)]"
              >
                <input
                  type="radio"
                  name="favorite_game"
                  value={value}
                  defaultChecked={(favoriteGame ?? "") === value}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <SubmitButton className="self-start" pendingChildren="Saving…">
          Save profile
        </SubmitButton>
      </form>
    </div>
  );
}

function friendly(message: string): string {
  if (/could not be decoded|decode/i.test(message)) {
    return "That file isn't a readable image. Try a JPEG or PNG photo.";
  }
  if (/exceeded the maximum allowed size|too large|payload/i.test(message)) {
    return "That photo is too large even after shrinking. Try a different one.";
  }
  if (/mime|type/i.test(message)) return "Choose a JPEG, PNG or WebP photo.";
  if (/row-level security|policy|not allowed/i.test(message)) return "You can't change this photo.";
  return "Upload failed. Check your connection and try again.";
}
