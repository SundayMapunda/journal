// The five moods, shared by the forms and the entry list.
// Colors are defined in globals.css (--mood-1 ... --mood-5).
export const MOODS = [
  { value: 1, emoji: "😞", label: "Low", color: "var(--mood-1)" },
  { value: 2, emoji: "😕", label: "Down", color: "var(--mood-2)" },
  { value: 3, emoji: "😐", label: "Okay", color: "var(--mood-3)" },
  { value: 4, emoji: "🙂", label: "Good", color: "var(--mood-4)" },
  { value: 5, emoji: "😄", label: "Great", color: "var(--mood-5)" },
] as const;

export function moodFor(value: number | null) {
  return MOODS.find((m) => m.value === value) ?? null;
}
