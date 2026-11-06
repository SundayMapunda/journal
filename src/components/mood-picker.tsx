import type { CSSProperties } from "react";
import { MOODS } from "@/lib/moods";

// Five mood circles that work as radio buttons (no JavaScript needed).
export default function MoodPicker({
  name = "mood",
  defaultValue = null,
  small = false,
}: {
  name?: string;
  defaultValue?: number | null;
  small?: boolean;
}) {
  return (
    <fieldset className="flex items-center gap-2">
      <legend className="sr-only">Mood</legend>
      {MOODS.map((m) => (
        <label key={m.value} title={m.label} className="mood-label">
          <input
            type="radio"
            name={name}
            value={m.value}
            defaultChecked={defaultValue === m.value}
            className="mood-input sr-only"
          />
          <span
            className={small ? "mood-dot mood-dot-sm" : "mood-dot"}
            style={{ "--c": m.color } as CSSProperties}
          >
            <span aria-hidden="true">{m.emoji}</span>
            <span className="sr-only">{m.label}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
