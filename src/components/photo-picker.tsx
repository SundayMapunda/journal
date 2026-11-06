"use client";

import { useEffect, useRef, useState } from "react";
import { createUploadUrl } from "@/app/actions";

const MAX_SIDE = 1600; // longest side in pixels after shrinking
const MAX_BYTES = 2 * 1024 * 1024; // must match the server limit

type Uploaded = { key: string; previewUrl: string };

// Shrinks a photo in the browser and converts it to JPEG.
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.fillStyle = "#ffffff"; // PNGs with transparency get a white background
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not compress"))),
      "image/jpeg",
      0.82
    )
  );
}

export default function PhotoPicker({ maxPhotos }: { maxPhotos: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // When the form is reset after saving, clear the thumbnails too.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;

    const onReset = () =>
      setPhotos((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        return [];
      });

    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  if (maxPhotos <= 0) {
    return (
      <p className="text-sm text-muted">
        This entry already has the maximum number of photos.
      </p>
    );
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setError("");

    const room = maxPhotos - photos.length;
    if (files.length > room) {
      setError(`You can add up to ${maxPhotos} photos to this entry.`);
    }

    setBusy(true);
    try {
      for (const file of files.slice(0, Math.max(room, 0))) {
        if (!file.type.startsWith("image/")) {
          setError("Only photos are allowed.");
          continue;
        }

        const blob = await compressImage(file);
        if (blob.size > MAX_BYTES) {
          setError("That photo is still too large after shrinking (max 2 MB).");
          continue;
        }

        const res = await createUploadUrl(blob.type, blob.size);
        if ("error" in res) {
          setError(res.error);
          continue;
        }

        const put = await fetch(res.url, {
          method: "PUT",
          headers: { "Content-Type": blob.type },
          body: blob,
        });
        if (!put.ok) {
          setError("Upload failed. Please try again.");
          continue;
        }

        setPhotos((prev) => [
          ...prev,
          { key: res.key, previewUrl: URL.createObjectURL(blob) },
        ]);
      }
    } catch {
      setError("Could not read or upload that photo.");
    } finally {
      setBusy(false);
    }
  }

  function removePhoto(key: string) {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.key === key);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={onPick}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy || photos.length >= maxPhotos}
          onClick={() => inputRef.current?.click()}
          className="btn-quiet"
        >
          {busy ? "Uploading..." : "Add photos"}
        </button>
        <span className="text-xs text-muted">
          {photos.length} of {maxPhotos} added
          {busy && ". Wait for the upload to finish before saving."}
        </span>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {photos.map((p) => (
            <div key={p.key} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.previewUrl}
                alt="Photo to be saved"
                className="h-20 w-20 rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(p.key)}
                aria-label="Remove photo"
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-xs leading-none text-paper"
              >
                ✕
              </button>
              <input type="hidden" name="photoKeys" value={p.key} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
