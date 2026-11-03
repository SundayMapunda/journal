"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/db";
import { entries, tags, entryTags } from "@/db/schema";

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

export async function createEntry(formData: FormData) {
  const userId = await requireUserId();

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const moodRaw = Number(formData.get("mood"));
  const mood = moodRaw >= 1 && moodRaw <= 5 ? moodRaw : null;
  const tagNames = parseTags(String(formData.get("tags") ?? ""));

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

  revalidatePath("/");
  redirect("/");
}

export async function deleteEntry(formData: FormData) {
  const userId = await requireUserId();

  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return;

  // Only deletes the entry if it belongs to the logged-in user.
  // Its tag links are removed automatically (cascade).
  await db.delete(entries).where(and(eq(entries.id, id), eq(entries.userId, userId)));

  revalidatePath("/");
}
