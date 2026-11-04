import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, exists, inArray, type SQL } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/db";
import { entries, tags, entryTags, attachments } from "@/db/schema";
import { MAX_PHOTOS_PER_ENTRY, presignView } from "@/lib/r2";
import { createEntry, deleteEntry } from "./actions";
import SignOutButton from "./sign-out-button";
import PhotoPicker from "@/components/photo-picker";

const moods = ["😞", "😕", "😐", "🙂", "😄"];

async function EntryList({
  userId,
  mood,
  tag,
}: {
  userId: string;
  mood: number | null;
  tag: string | null;
}) {
  const conditions: SQL[] = [eq(entries.userId, userId)];

  if (mood) conditions.push(eq(entries.mood, mood));

  if (tag) {
    conditions.push(
      exists(
        db
          .select({ one: entryTags.entryId })
          .from(entryTags)
          .innerJoin(tags, eq(tags.id, entryTags.tagId))
          .where(and(eq(entryTags.entryId, entries.id), eq(tags.name, tag)))
      )
    );
  }

  const list = await db
    .select()
    .from(entries)
    .where(and(...conditions))
    .orderBy(desc(entries.createdAt));

  // Load the tags for the entries we're showing.
  const ids = list.map((e) => e.id);
  const tagRows =
    ids.length > 0
      ? await db
          .select({ entryId: entryTags.entryId, name: tags.name })
          .from(entryTags)
          .innerJoin(tags, eq(tags.id, entryTags.tagId))
          .where(inArray(entryTags.entryId, ids))
      : [];

  const tagsByEntry = new Map<string, string[]>();
  for (const row of tagRows) {
    tagsByEntry.set(row.entryId, [...(tagsByEntry.get(row.entryId) ?? []), row.name]);
  }

  // Load the photos for these entries, each with a temporary private link.
  const photoRows =
    ids.length > 0
      ? await db
          .select({
            id: attachments.id,
            entryId: attachments.entryId,
            key: attachments.url,
          })
          .from(attachments)
          .where(and(eq(attachments.userId, userId), inArray(attachments.entryId, ids)))
          .orderBy(attachments.createdAt)
      : [];

  const signedPhotos = await Promise.all(
    photoRows.map(async (p) => ({
      id: p.id,
      entryId: p.entryId,
      src: await presignView(p.key),
    }))
  );

  const photosByEntry = new Map<string, { id: string; src: string }[]>();
  for (const p of signedPhotos) {
    photosByEntry.set(p.entryId, [
      ...(photosByEntry.get(p.entryId) ?? []),
      { id: p.id, src: p.src },
    ]);
  }

  return (
    <section className="space-y-4">
      {list.length === 0 && (
        <p className="opacity-60">
          {mood || tag
            ? "No entries match this filter."
            : "No entries yet. Write your first one above."}
        </p>
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
            <div className="flex items-center gap-3">
              <Link
                href={`/entries/${e.id}/edit`}
                className="text-sm underline opacity-70"
              >
                Edit
              </Link>
              <form action={deleteEntry}>
                <input type="hidden" name="id" value={e.id} />
                <button type="submit" className="text-sm text-red-600">
                  Delete
                </button>
              </form>
            </div>
          </div>

          <p className="mt-2 whitespace-pre-wrap">{e.body}</p>

          {(photosByEntry.get(e.id) ?? []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {photosByEntry.get(e.id)!.map((p) => (
                <a key={p.id} href={p.src} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.src}
                    alt="Journal photo"
                    loading="lazy"
                    className="h-28 w-28 rounded object-cover"
                  />
                </a>
              ))}
            </div>
          )}

          {(tagsByEntry.get(e.id) ?? []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {tagsByEntry.get(e.id)!.map((name) => (
                <Link
                  key={name}
                  href={`/?${new URLSearchParams({ tag: name })}`}
                  className="rounded-full border px-2 py-0.5 text-xs opacity-80"
                >
                  #{name}
                </Link>
              ))}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

async function Journal({
  searchParams,
}: {
  searchParams: Promise<{ mood?: string; tag?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const userId = session.user.id;

  // Filters come from the URL, e.g. /?mood=4&tag=work
  const sp = await searchParams;
  const moodNum = Number(sp.mood);
  const mood = moodNum >= 1 && moodNum <= 5 ? moodNum : null;
  const tag = sp.tag?.trim().toLowerCase() || null;

  // Tags this user has actually used, for the filter dropdown.
  const tagOptions = await db
    .selectDistinct({ name: tags.name })
    .from(tags)
    .innerJoin(entryTags, eq(entryTags.tagId, tags.id))
    .where(eq(tags.userId, userId))
    .orderBy(tags.name);

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Journal</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm opacity-60">{session.user.name}</span>
          <SignOutButton />
        </div>
      </header>

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
        <input
          name="tags"
          placeholder="Tags, separated by commas (e.g. work, ideas)"
          className="w-full rounded border p-2"
        />
        <PhotoPicker maxPhotos={MAX_PHOTOS_PER_ENTRY} />
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

      <Form action="/" className="flex flex-wrap items-center gap-2">
        <select
          name="mood"
          defaultValue={mood ? String(mood) : ""}
          className="rounded border p-2"
        >
          <option value="">Any mood</option>
          {moods.map((m, i) => (
            <option key={i} value={i + 1}>
              {m} {i + 1}
            </option>
          ))}
        </select>
        <select name="tag" defaultValue={tag ?? ""} className="rounded border p-2">
          <option value="">Any tag</option>
          {tagOptions.map((t) => (
            <option key={t.name} value={t.name}>
              #{t.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded border px-3 py-2">
          Filter
        </button>
        {(mood || tag) && (
          <Link href="/" className="text-sm underline opacity-70">
            Clear
          </Link>
        )}
      </Form>

      <Suspense fallback={<p className="opacity-60">Loading entries...</p>}>
        <EntryList userId={userId} mood={mood} tag={tag} />
      </Suspense>
    </main>
  );
}

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ mood?: string; tag?: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-4 opacity-60">Loading...</p>}>
      <Journal searchParams={searchParams} />
    </Suspense>
  );
}
