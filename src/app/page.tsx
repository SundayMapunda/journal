import { Suspense, type CSSProperties } from "react";
import Form from "next/form";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, exists, inArray, type SQL } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { moodFor } from "@/lib/moods";
import { MAX_PHOTOS_PER_ENTRY, presignView } from "@/lib/r2";
import { db } from "@/db/db";
import { entries, tags, entryTags, attachments } from "@/db/schema";
import { createEntry, deleteEntry } from "./actions";
import SignOutButton from "./sign-out-button";
import PhotoPicker from "@/components/photo-picker";
import MoodPicker from "@/components/mood-picker";

// "2026-11-04" -> pieces for the date column. Parsed by hand so time zones can't shift the day.
function parseDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return {
    day: String(d).padStart(2, "0"),
    weekday: date.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
    monthYear: date.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

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
    .orderBy(desc(entries.entryDate), desc(entries.createdAt));

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

  if (list.length === 0) {
    return (
      <p className="mt-10 text-muted">
        {mood || tag
          ? "No entries match this filter."
          : "Nothing here yet. Write a few lines above. Even one sentence counts."}
      </p>
    );
  }

  // Group the entries by month.
  const groups: { label: string; items: typeof list }[] = [];
  for (const e of list) {
    const { monthYear } = parseDay(e.entryDate);
    const last = groups[groups.length - 1];
    if (last && last.label === monthYear) last.items.push(e);
    else groups.push({ label: monthYear, items: [e] });
  }

  return (
    <div className="mt-10 space-y-12">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="font-serif text-base italic text-muted">{group.label}</h2>

          <div className="mt-2 divide-y divide-line">
            {group.items.map((e) => {
              const d = parseDay(e.entryDate);
              const m = moodFor(e.mood);
              const entryTagNames = tagsByEntry.get(e.id) ?? [];
              const entryPhotos = photosByEntry.get(e.id) ?? [];

              return (
                <article
                  key={e.id}
                  className="grid grid-cols-[3.25rem_1fr] gap-x-4 py-7 sm:grid-cols-[4.5rem_1fr] sm:gap-x-6"
                >
                  {/* Date column */}
                  <div className="flex flex-col items-start">
                    <span className="font-serif text-3xl leading-none">{d.day}</span>
                    <span className="mt-1.5 text-xs text-muted">{d.weekday}</span>
                    {m && (
                      <span
                        className="mood-dot mood-dot-sm mt-4"
                        style={{ "--c": m.color } as CSSProperties}
                        role="img"
                        aria-label={`Mood: ${m.label}`}
                        title={m.label}
                      >
                        {m.emoji}
                      </span>
                    )}
                  </div>

                  {/* Entry */}
                  <div className="min-w-0">
                    {e.title && (
                      <h3 className="font-serif text-xl font-semibold leading-snug">
                        {e.title}
                      </h3>
                    )}
                    <p
                      className={`whitespace-pre-wrap font-serif text-[1.05rem] leading-[1.75] ${
                        e.title ? "mt-2" : ""
                      }`}
                    >
                      {e.body}
                    </p>

                    {entryPhotos.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {entryPhotos.map((p) => (
                          <a key={p.id} href={p.src} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={p.src}
                              alt="Journal photo"
                              loading="lazy"
                              className="h-28 w-28 rounded-lg object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <div className="flex flex-wrap gap-2">
                        {entryTagNames.map((name) => (
                          <Link
                            key={name}
                            href={`/?${new URLSearchParams({ tag: name })}`}
                            className="rounded-full bg-line/60 px-2.5 py-0.5 text-xs text-muted hover:text-ink"
                          >
                            #{name}
                          </Link>
                        ))}
                      </div>

                      <div className="flex items-center gap-4">
                        <Link href={`/entries/${e.id}/edit`} className="link-quiet">
                          Edit
                        </Link>
                        <form action={deleteEntry}>
                          <input type="hidden" name="id" value={e.id} />
                          <button type="submit" className="link-quiet hover:text-danger">
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
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

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Dar_es_Salaam",
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-24 pt-6 sm:px-6">
      <header className="flex items-center justify-between">
        <span className="font-serif text-lg font-semibold">Journal</span>
        <div className="flex items-center gap-4 text-sm text-muted">
          <span>{session.user.name}</span>
          <SignOutButton />
        </div>
      </header>

      {/* Today */}
      <section className="mt-14">
        <h1 className="font-serif text-4xl font-semibold leading-tight sm:text-5xl">
          {today}
        </h1>

        <form
          action={createEntry}
          className="mt-6 space-y-4 rounded-2xl border border-line bg-sheet p-4 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 sm:p-5"
        >
          <input
            name="title"
            placeholder="Title (optional)"
            aria-label="Title"
            className="w-full bg-transparent font-serif text-xl font-semibold placeholder:text-muted/60 focus:outline-none"
          />
          <textarea
            name="body"
            required
            rows={5}
            placeholder="What happened today?"
            aria-label="Entry"
            className="w-full resize-y bg-transparent font-serif text-[1.05rem] leading-[1.75] placeholder:text-muted/60 focus:outline-none"
          />
          <input
            name="tags"
            placeholder="Tags, separated by commas"
            aria-label="Tags"
            className="w-full border-t border-line bg-transparent pt-3 text-sm placeholder:text-muted/60 focus:outline-none"
          />

          <PhotoPicker maxPhotos={MAX_PHOTOS_PER_ENTRY} />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <MoodPicker />
            <button type="submit" className="btn">
              Save entry
            </button>
          </div>
        </form>
      </section>

      {/* Filters */}
      <Form action="/" className="mt-12 flex flex-wrap items-center gap-3">
        <MoodPicker defaultValue={mood} small />
        <select
          name="tag"
          defaultValue={tag ?? ""}
          aria-label="Tag"
          className="field w-auto py-1.5 text-sm"
        >
          <option value="">Any tag</option>
          {tagOptions.map((t) => (
            <option key={t.name} value={t.name}>
              #{t.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-quiet py-1.5">
          Filter
        </button>
        {(mood || tag) && (
          <Link href="/" className="link-quiet">
            Clear filter
          </Link>
        )}
      </Form>

      <Suspense fallback={<p className="mt-10 text-muted">Loading entries...</p>}>
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
    <Suspense fallback={<p className="p-6 text-muted">Loading...</p>}>
      <Journal searchParams={searchParams} />
    </Suspense>
  );
}
