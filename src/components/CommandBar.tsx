"use client";

import { Link2, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  onAdd: (urls: string[]) => Promise<boolean>;
  disabled?: boolean;
  onSearchChange: (query: string) => void;
  /** Links currently visible under the active filter + search. */
  resultCount: number;
  /** Links visible under the active filter alone, ignoring search. */
  filteredTotal: number;
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

function plural(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? "s" : ""}`;
}

const SEARCH_PREFIX = "/";

/**
 * One field doing two jobs. A leading "/" is the mode switch: everything after
 * it filters the list as you type and nothing is ever submitted, so the same
 * box is both the paste target and the search box.
 */
export function CommandBar({
  onAdd,
  disabled,
  onSearchChange,
  resultCount,
  filteredTotal,
}: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isSearch = value.startsWith(SEARCH_PREFIX);
  const query = isSearch ? value.slice(1) : "";

  const urls = useMemo(
    () => (isSearch ? [] : dedupe(parseUrls(value))),
    [value, isSearch],
  );
  const endsWithSeparator = /[\s,]$/.test(value);

  function update(next: string) {
    setValue(next);
    onSearchChange(next.startsWith(SEARCH_PREFIX) ? next.slice(1) : "");
  }

  // "/" anywhere on the page jumps into search, the way it does in most
  // list-shaped apps — but never while the user is already typing somewhere.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== SEARCH_PREFIX || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
      setValue(SEARCH_PREFIX);
      onSearchChange("");
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onSearchChange]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Enter is a no-op in search mode: the list already updated as you typed.
    if (isSearch || !urls.length) return;
    const ok = await onAdd(urls);
    if (ok) update("");
  }

  // A multi-URL paste arrives as one blob of newlines or spaces; rewrite it into
  // the comma-separated form the field displays. Single-URL pastes fall through
  // to the browser so cursor position and undo behave normally.
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    if (isSearch) return;
    const pasted = parseUrls(e.clipboardData.getData("text"));
    if (pasted.length < 2) return;
    e.preventDefault();
    update(dedupe([...parseUrls(value), ...pasted]).join(", "));
  }

  const Icon = isSearch ? Search : Link2;

  // Lives inside the field rather than on a line of its own — the hint row it
  // replaced cost a whole row of vertical space to restate the placeholder.
  let status: string;
  if (isSearch) {
    status = query.trim()
      ? `${resultCount} of ${filteredTotal}`
      : plural(filteredTotal, "link");
  } else if (value.trim() && !endsWithSeparator) {
    status = `${plural(urls.length, "link")} ↵`;
  } else {
    status = plural(resultCount, "link");
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        {/* Deliberately type="text": a comma-separated list fails type="url"
            validation, which would silently block submit. */}
        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste a URL — or / to search"
          value={value}
          onChange={(e) => update(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === "Escape" && value) {
              e.preventDefault();
              update("");
            }
          }}
          disabled={disabled}
          className="w-full rounded-md border border-border bg-input py-2 pl-9 pr-24 text-sm text-foreground outline-none ring-ring transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 disabled:opacity-50"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground">
          {status}
        </span>
      </div>
    </form>
  );
}
