import { useState } from "react";
import { X } from "lucide-react";

// Comma-separated tag editor: type "blonde, cute, golf" and press Enter to turn
// it into individual chips. Chips can be removed (×) or edited (click the text).
export function TraitsInput({
  traits,
  onChange,
  placeholder = "e.g. blonde, cute, golf, playful",
}: {
  traits: string[];
  onChange: (traits: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");

  function commitDraft() {
    if (!draft.trim()) return;
    const pieces = draft
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const existingLower = traits.map((t) => t.toLowerCase());
    const additions = pieces.filter((p) => !existingLower.includes(p.toLowerCase()));
    if (additions.length > 0) onChange([...traits, ...additions]);
    setDraft("");
  }

  function removeAt(index: number) {
    onChange(traits.filter((_, i) => i !== index));
  }

  function commitEdit(index: number) {
    const trimmed = editingValue.trim();
    if (!trimmed) {
      removeAt(index);
    } else {
      onChange(traits.map((t, i) => (i === index ? trimmed : t)));
    }
    setEditingIndex(null);
  }

  return (
    <div>
      {traits.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {traits.map((trait, i) =>
            editingIndex === i ? (
              <input
                key={i}
                autoFocus
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={() => commitEdit(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit(i);
                  if (e.key === "Escape") setEditingIndex(null);
                }}
                className="h-7 w-28 rounded-full surface-field px-2.5 text-[12px] text-neutral-100 outline-none focus:border-[#c99a5f]/40"
              />
            ) : (
              <span
                key={i}
                className="flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[12px] text-neutral-300"
              >
                <button
                  onClick={() => {
                    setEditingIndex(i);
                    setEditingValue(trait);
                  }}
                  className="hover:text-neutral-100 transition-colors"
                >
                  {trait}
                </button>
                <button
                  onClick={() => removeAt(i)}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-neutral-600 hover:text-neutral-200 hover:bg-white/[0.08] transition-colors"
                >
                  <X size={10} />
                </button>
              </span>
            )
          )}
        </div>
      )}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commitDraft();
          }
        }}
        onBlur={commitDraft}
        placeholder={placeholder}
        className="w-full h-9 rounded-lg surface-field px-3 text-[12.5px] text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-[#c99a5f]/40 transition-colors"
      />
    </div>
  );
}
