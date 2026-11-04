"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  ALLOWED_TYPES,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_ENTRY,
  presignUpload,
  headObject,
  deleteObjects,
} from "@/lib/r2";
import { db } from "@/db/db";
import { entries, tags, entryTags, attachments } from "@/db/schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The user id always comes from the login session, never from the form.
async function requireUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Not signed in");
  return session.user.id;
}

// "Work, #Ideas, work" -> ["work", "ideas"]  (lowercase, no duplicates, max 10)
function parseTags(raw: string) {
  const names = raw
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/^#/, "").slice(0, 30))
    .filter(Boolean);
  return [...new Set(names)].slice(0, 10);
}

// Creates any tags that don't exist yet for this user, then links them to the entry.
async function linkTags(userId: string, entryId: string, tagNames: string[]) {
  if (tagNames.length === 0) return;

  await db
    .insert(tags)
    .values(tagNames.map((name) => ({ userId, name })))
    .onConflictDoNothing();

  const tagRows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.name, tagNames)));

  await db
    .insert(entryTags)
    .values(tagRows.map((t) => ({ entryId, tagId: t.id })));
}

// Saves the photos the browser already uploaded to R2.
// Each file is double-checked in R2 (real size and type) before it's accepted.
async function saveAttachments(
  userId: string,
  entryId: string,
  keys: string[],
  room: number
) {
  const rows: (typeof attachments.$inferInsert)[] = [];

  for (const key of [...new Set(keys)].slice(0, Math.max(room, 0))) {
    // Users can only attach files that sit in their own folder.
    if (!key.startsWith(`${userId}/`)) continue;

    const info = await headObject(key);
    if (!info) continue;

    if (info.size > MAX_PHOTO_BYTES || !(info.type in ALLOWED_TYPES)) {
      await deleteObjects([key]);
      continue;
    }

    rows.push({ entryId, userId, type: "image", url: key, sizeBytes: info.size });
  }

  if (rows.length > 0) await db.insert(attachments).values(rows);
}

// Called by the browser to get a one-time upload link for a single photo.
export async function createUploadUrl(
  contentType: string,
  size: number
): Promise<{ url: string; key: string } | { error: string }> {
  const userId = await requireUserId();

  const ext = ALLOWED_TYPES[contentType];
  if (!ext) return { error: "Only JPEG, PNG or WebP photos are allowed." };
  if (size > MAX_PHOTO_BYTES) {
    return { error: "That photo is still too large (max 2 MB). Try a smaller one." };
  }

  const key = `${userId}/${crypto.randomUUID()}.${ext}`;
  return { url: await presignUpload(key, contentType), key };
}

export async function createEntry(formData: FormData) {
  const userId = await requireUserId();

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const moodRaw = Number(formData.get("mood"));
  const mood = moodRaw >= 1 && moodRaw <= 5 ? moodRaw : null;
  const tagNames = parseTags(String(formData.get("tags") ?? ""));
  const photoKeys = formData.getAll("photoKeys").map(String);

  if (!body) return;

  const [entry] = await db
    .insert(entries)
    .values({
      userId,
      title: title || null,
      body,
      mood,
      // Date in Tanzania time (en-CA gives YYYY-MM-DD). Per-user timezone comes later.
      entryDate: new Date().toLocaleDateString("en-CA", {
        timeZone: "Africa/Dar_es_Salaam",
      }),
    })
    .returning({ id: entries.id });

  await linkTags(userId, entry.id, tagNames);
  await saveAttachments(userId, entry.id, photoKeys, MAX_PHOTOS_PER_ENTRY);

  revalidatePath("/");
}

export async function updateEntry(formData: FormData) {
  const userId = await requireUserId();

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const moodRaw = Number(formData.get("mood"));
  const mood = moodRaw >= 1 && moodRaw <= 5 ? moodRaw : null;
  const tagNames = parseTags(String(formData.get("tags") ?? ""));
  const photoKeys = formData.getAll("photoKeys").map(String);
  const removeIds = formData
    .getAll("removePhotoIds")
    .map(String)
    .filter((v) => UUID_RE.test(v));

  if (!UUID_RE.test(id) || !body) return;

  // Only updates the entry if it belongs to the logged-in user.
  const updated = await db
    .update(entries)
    .set({ title: title || null, body, mood, updatedAt: new Date() })
    .where(and(eq(entries.id, id), eq(entries.userId, userId)))
    .returning({ id: entries.id });

  if (updated.length === 0) return;

  // Replace the old tag links with the new ones.
  await db.delete(entryTags).where(eq(entryTags.entryId, id));
  await linkTags(userId, id, tagNames);

  // Remove the photos the user ticked (database rows and the files in R2).
  if (removeIds.length > 0) {
    const toRemove = await db
      .select({ id: attachments.id, key: attachments.url })
      .from(attachments)
      .where(
        and(
          eq(attachments.entryId, id),
          eq(attachments.userId, userId),
          inArray(attachments.id, removeIds)
        )
      );

    if (toRemove.length > 0) {
      await db.delete(attachments).where(
        inArray(
          attachments.id,
          toRemove.map((r) => r.id)
        )
      );
      await deleteObjects(toRemove.map((r) => r.key));
    }
  }

  // Add new photos, up to the per-entry limit.
  const remaining = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(eq(attachments.entryId, id));

  await saveAttachments(userId, id, photoKeys, MAX_PHOTOS_PER_ENTRY - remaining.length);

  revalidatePath("/");
  redirect("/");
}

export async function deleteEntry(formData: FormData) {
  const userId = await requireUserId();

  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return;

  // Remember the photo files first, because the database rows disappear with the entry.
  const photos = await db
    .select({ key: attachments.url })
    .from(attachments)
    .where(and(eq(attachments.entryId, id), eq(attachments.userId, userId)));

  // Only deletes the entry if it belongs to the logged-in user.
  // Its tag links and photo rows are removed automatically (cascade).
  const deleted = await db
    .delete(entries)
    .where(and(eq(entries.id, id), eq(entries.userId, userId)))
    .returning({ id: entries.id });

  if (deleted.length > 0) await deleteObjects(photos.map((p) => p.key));

  revalidatePath("/");
}
