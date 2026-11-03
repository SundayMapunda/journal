import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/db";
import { entries } from "@/db/schema";
import { createEntry, deleteEntry } from "./actions";

const TEMP_USER_ID = "temp-user"; // replaced by real auth later
const moods = ["😞", "😕", "😐", "🙂", "😄"];

async function EntryList() {
  const list = await db
    .select()
    .from(entries)
    .where(eq(entries.userId, TEMP_USER_ID))
    .orderBy(desc(entries.createdAt));

  return (
    <section className="space-y-4">
      {list.length === 0 && (
        <p className="opacity-60">No entries yet. Write your first one above.</p>
      )}

      {list.map((e) => (
        <article key={e.id} className="rounded-lg border p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm opacity-60">
                {e.entryDate} {e.mood ? moods[e.mood - 1] : ""}
              </p>
              {e.title && <h2 className="font-medium">{e.title}</h2>}
            </div>
            <form action={deleteEntry}>
              <input type="hidden" name="id" value={e.id} />
              <button type="submit" className="text-sm text-red-600">
                Delete
              </button>
            </form>
          </div>
          <p className="mt-2 whitespace-pre-wrap">{e.body}</p>
        </article>
      ))}
    </section>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 p-4">
      <h1 className="text-2xl font-semibold">My Journal</h1>

      <form action={createEntry} className="space-y-3 rounded-lg border p-4">
        <input
          name="title"
          placeholder="Title (optional)"
          className="w-full rounded border p-2"
        />
        <textarea
          name="body"
          required
          rows={6}
          placeholder="What's on your mind?"
          className="w-full rounded border p-2"
        />
        <div className="flex items-center gap-3">
          <select name="mood" defaultValue="" className="rounded border p-2">
            <option value="">Mood</option>
            {moods.map((m, i) => (
              <option key={i} value={i + 1}>
                {m} {i + 1}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
          >
            Save entry
          </button>
        </div>
      </form>

      <Suspense fallback={<p className="opacity-60">Loading entries...</p>}>
        <EntryList />
      </Suspense>
    </main>
  );
}
