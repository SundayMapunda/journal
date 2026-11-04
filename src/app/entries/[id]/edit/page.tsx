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

const moods = ["😞", "😕", "😐", "🙂", "😄"];
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

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Edit entry</h1>
      <p className="text-sm opacity-60">Written on {entry.entryDate}</p>

      <form action={updateEntry} className="space-y-3 rounded-lg border p-4">
        <input type="hidden" name="id" value={entry.id} />
        <input
          name="title"
          defaultValue={entry.title ?? ""}
          placeholder="Title (optional)"
          className="w-full rounded border p-2"
        />
        <textarea
          name="body"
          required
          rows={10}
          defaultValue={entry.body}
          className="w-full rounded border p-2"
        />
        <input
          name="tags"
          defaultValue={tagRows.map((t) => t.name).join(", ")}
          placeholder="Tags, separated by commas (e.g. work, ideas)"
          className="w-full rounded border p-2"
        />

        {photos.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {photos.map((p) => (
              <label key={p.id} className="space-y-1 text-center text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.src}
                  alt="Journal photo"
                  className="h-20 w-20 rounded object-cover"
                />
                <span className="flex items-center justify-center gap-1">
                  <input type="checkbox" name="removePhotoIds" value={p.id} />
                  Remove
                </span>
              </label>
            ))}
          </div>
        )}

        <PhotoPicker maxPhotos={MAX_PHOTOS_PER_ENTRY - photos.length} />

        <div className="flex items-center gap-3">
          <select
            name="mood"
            defaultValue={entry.mood ? String(entry.mood) : ""}
            className="rounded border p-2"
          >
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
            Save changes
          </button>
          <Link href="/" className="text-sm underline opacity-70">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}

export default function EditEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<p className="p-4 opacity-60">Loading...</p>}>
      <EditForm params={params} />
    </Suspense>
  );
}
