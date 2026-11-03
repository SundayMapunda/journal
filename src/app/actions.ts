"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/db";
import { entries } from "@/db/schema";

// The user id always comes from the login session, never from the form.
async function requireUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Not signed in");
  return session.user.id;
}

export async function createEntry(formData: FormData) {
  const userId = await requireUserId();

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const moodRaw = Number(formData.get("mood"));
  const mood = moodRaw >= 1 && moodRaw <= 5 ? moodRaw : null;

  if (!body) return;

  await db.insert(entries).values({
    userId,
    title: title || null,
    body,
    mood,
    // Date in Tanzania time (en-CA gives YYYY-MM-DD). Per-user timezone comes later.
    entryDate: new Date().toLocaleDateString("en-CA", {
      timeZone: "Africa/Dar_es_Salaam",
    }),
  });

  revalidatePath("/");
}

export async function deleteEntry(formData: FormData) {
  const userId = await requireUserId();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Only deletes the entry if it belongs to the logged-in user.
  await db.delete(entries).where(and(eq(entries.id, id), eq(entries.userId, userId)));

  revalidatePath("/");
}
