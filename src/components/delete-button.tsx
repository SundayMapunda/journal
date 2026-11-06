"use client";

export default function DeleteButton() {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!confirm("Delete this entry and its photos? This can't be undone.")) {
          e.preventDefault();
        }
      }}
      className="text-sm text-ribbon hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      Delete
    </button>
  );
}
