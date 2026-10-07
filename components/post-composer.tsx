"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { Camera, X } from "lucide-react";
import { compressForPost } from "@/lib/image-client";
import { CAPTION_MAX, postImagePath } from "@/lib/posts";
import { createClient } from "@/lib/supabase/client";
import { createPost } from "@/app/(member)/posts/actions";

// "Post a photo" under the feed heading: pick or take a photo, write a
// caption, post. The photo is shrunk in the browser, uploaded by the
// member's own client into their folder of the private bucket, and the
// server records the post.
export function PostComposer({ meId }: { meId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // Set in a frame, not synchronously in the effect.
    const frame = requestAnimationFrame(() => setPreview(url));
    return () => {
      cancelAnimationFrame(frame);
      URL.revokeObjectURL(url);
    };
  }, [file]);

  function reset() {
    setFile(null);
    setPreview(null);
    setCaption("");
    setError(null);
    setBusy(false);
  }

  async function post() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await compressForPost(file);
      const path = postImagePath(meId, crypto.randomUUID());
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from("posts")
        .upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600" });
      if (upErr) throw new Error(upErr.message);
      const r = await createPost({ imagePath: path, caption });
      if (r.error) throw new Error(r.error);
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the photo.");
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="press bg-card flex h-12 items-center gap-2.5 rounded-full px-4 text-left text-[15px] shadow-[inset_0_0_0_1px_var(--hairline-row)]"
        >
          <Camera className="text-brass size-[18px] shrink-0" strokeWidth={1.8} />
          <span className="text-muted-foreground">Post a photo</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-20 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="bg-background fixed inset-x-0 bottom-0 z-30 flex max-h-[90vh] flex-col gap-4 overflow-y-auto rounded-t-[24px] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-[17px] font-semibold tracking-[-0.01em]">New post</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="press flex size-9 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-strong)]"
            >
              <X className="size-4" strokeWidth={1.8} />
            </Dialog.Close>
          </div>

          <input
            ref={input}
            type="file"
            accept="image/*"
            aria-label="Choose a photo"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setError(null);
            }}
          />
          {preview ? (
            <button type="button" onClick={() => input.current?.click()} className="press" aria-label="Change photo">
              <img src={preview} alt="" className="max-h-[50vh] w-full rounded-[20px] object-cover" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="press bg-card text-muted-foreground flex h-40 flex-col items-center justify-center gap-2 rounded-[20px] text-[14px] shadow-[inset_0_0_0_1px_var(--hairline-row)]"
            >
              <Camera className="size-6" strokeWidth={1.6} />
              Choose a photo
            </button>
          )}

          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={CAPTION_MAX}
            rows={3}
            placeholder="Say something about the shot"
            aria-label="Caption"
            className="bg-card text-foreground placeholder:text-muted-foreground w-full resize-none rounded-[16px] px-4 py-3 text-base outline-none shadow-[inset_0_0_0_1px_var(--hairline-row)]"
          />
          <div className="text-muted-foreground flex items-center justify-between text-[12px]">
            <span>{caption.length}/{CAPTION_MAX}</span>
            {error && <span className="text-destructive">{error}</span>}
          </div>
          <button
            type="button"
            onClick={post}
            disabled={!file || busy}
            className="press bg-primary text-primary-foreground h-12 rounded-full text-[15px] font-semibold disabled:opacity-40"
          >
            {busy ? "Posting…" : "Post"}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
