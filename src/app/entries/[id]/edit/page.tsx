import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { MAX_PHOTOS_PER_ENTRY, presignView } from "@/lib/r2";
import { db } from "@/db/db";
import { entries, tags, entryTags, attachments } from "@/db/schema";
import { updateEntry } from "@/app/actions";
import PhotoPicker from "@/components/photo-picker";
import MoodPicker from "@/components/mood-picker";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function EditForm({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  // Only loads the entry if it belongs to the logged-in user.
  const [entry] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.id, id), eq(entries.userId, session.user.id)));

  if (!entry) notFound();

  const tagRows = await db
    .select({ name: tags.name })
    .from(entryTags)
    .innerJoin(tags, eq(tags.id, entryTags.tagId))
    .where(eq(entryTags.entryId, entry.id));

  const photoRows = await db
    .select({ id: attachments.id, key: attachments.url })
    .from(attachments)
    .where(and(eq(attachments.entryId, entry.id), eq(attachments.userId, session.user.id)))
    .orderBy(attachments.createdAt);

  const photos = await Promise.all(
    photoRows.map(async (p) => ({ id: p.id, src: await presignView(p.key) }))
  );

  const [y, m, d] = entry.entryDate.split("-").map(Number);
  const written = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-24 pt-6 sm:px-6">
      <header className="flex items-center justify-between">
        <span className="font-serif text-lg font-semibold">Journal</span>
        <Link href="/" className="link-quiet">
          Back to journal
        </Link>
      </header>

      <section className="mt-14">
        <p className="text-sm text-muted">Editing the entry from</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold leading-tight sm:text-4xl">
          {written}
        </h1>

        <form
          action={updateEntry}
          className="mt-6 space-y-4 rounded-2xl border border-line bg-sheet p-4 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 sm:p-5"
        >
          <input type="hidden" name="id" value={entry.id} />

          <input
            name="title"
            defaultValue={entry.title ?? ""}
            placeholder="Title (optional)"
            aria-label="Title"
            className="w-full bg-transparent font-serif text-xl font-semibold placeholder:text-muted/60 focus:outline-none"
          />
          <textarea
            name="body"
            required
            rows={10}
            defaultValue={entry.body}
            aria-label="Entry"
            className="w-full resize-y bg-transparent font-serif text-[1.05rem] leading-[1.75] placeholder:text-muted/60 focus:outline-none"
          />
          <input
            name="tags"
            defaultValue={tagRows.map((t) => t.name).join(", ")}
            placeholder="Tags, separated by commas"
            aria-label="Tags"
            className="w-full border-t border-line bg-transparent pt-3 text-sm placeholder:text-muted/60 focus:outline-none"
          />

          {photos.length > 0 && (
            <div className="flex flex-wrap gap-4">
              {photos.map((p) => (
                <label key={p.id} className="space-y-1.5 text-xs text-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.src}
                    alt="Journal photo"
                    className="h-20 w-20 rounded-lg object-cover"
                  />
                  <span className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      name="removePhotoIds"
                      value={p.id}
                      className="accent-[var(--accent)]"
                    />
                    Remove
                  </span>
                </label>
              ))}
            </div>
          )}

          <PhotoPicker maxPhotos={MAX_PHOTOS_PER_ENTRY - photos.length} />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <MoodPicker defaultValue={entry.mood} />
            <div className="flex items-center gap-4">
              <Link href="/" className="link-quiet">
                Cancel
              </Link>
              <button type="submit" className="btn">
                Save changes
              </button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}

export default function EditEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-6 text-muted">Loading...</p>}>
      <EditForm params={params} />
    </Suspense>
  );
}
