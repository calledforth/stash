"use client";

import { useMemo, useState } from "react";

type Props = {
  onAdd: (urls: string[]) => Promise<boolean>;
  disabled?: boolean;
};

/**
 * URLs never contain unescaped whitespace, and a comma in a real URL is rare
 * enough that treating both as separators is the right trade for pasting a
 * clipboard full of links.
 */
function parseUrls(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupe(urls: string[]): string[] {
  return [...new Set(urls)];
}

export function AddLinkInput({ onAdd, disabled }: Props) {
  const [value, setValue] = useState("");

  const urls = useMemo(() => dedupe(parseUrls(value)), [value]);
  const endsWithSeparator = /[\s,]$/.test(value);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!urls.length) return;
    const ok = await onAdd(urls);
    if (ok) setValue("");
  }

  // A multi-URL paste arrives as one blob of newlines or spaces; rewrite it into
  // the comma-separated form the field displays. Single-URL pastes fall through
  // to the browser so cursor position and undo behave normally.
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = parseUrls(e.clipboardData.getData("text"));
    if (pasted.length < 2) return;
    e.preventDefault();
    setValue(dedupe([...parseUrls(value), ...pasted]).join(", "));
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      {/* Deliberately type="text": a comma-separated list fails type="url"
          validation, which would silently block submit. */}
      <input
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="Paste a URL — or several, separated by commas"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPaste={handlePaste}
        disabled={disabled}
        className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none ring-ring transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 disabled:opacity-50"
      />
      {value.trim() && (
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
          {endsWithSeparator
            ? "Paste or type another URL…"
            : `${urls.length} link${urls.length !== 1 ? "s" : ""} ready — Enter to add ${
                urls.length !== 1 ? "all" : ""
              }`.trim()}
        </p>
      )}
    </form>
  );
}
