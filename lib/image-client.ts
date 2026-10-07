// Browser only: shrink a phone photo before it goes to Storage (spec §2).
// Longest side 1280, JPEG 0.82 — a 12 MB camera shot becomes 150–300 KB.
// Orientation is honoured from EXIF so a portrait shot stays portrait.
export const POST_IMAGE_MAX = 1280;

export async function compressForPost(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, POST_IMAGE_MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("could not draw the photo");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode the photo"))), "image/jpeg", 0.82)
  );
}
