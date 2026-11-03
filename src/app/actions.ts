"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/db";
import { entries } from "@/db/schema";

// Temporary: replaced by the real logged-in user once we add auth.
const TEMP_USER_ID = "temp-user";

export async function createEntry(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const moodRaw = Number(formData.get("mood"));
  const mood = moodRaw >= 1 && moodRaw <= 5 ? moodRaw : null;

  if (!body) return;

  await db.insert(entries).values({
    userId: TEMP_USER_ID,
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
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db
    .delete(entries)
    .where(and(eq(entries.id, id), eq(entries.userId, TEMP_USER_ID)));

  revalidatePath("/");
}
