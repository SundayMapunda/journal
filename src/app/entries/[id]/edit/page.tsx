import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/db";
import { entries, tags, entryTags } from "@/db/schema";
import { updateEntry } from "@/app/actions";

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
