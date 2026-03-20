"use client";

import { useState } from "react";

type Props = {
  onAdd: (url: string) => Promise<boolean>;
  disabled?: boolean;
};

export function AddLinkInput({ onAdd, disabled }: Props) {
  const [value, setValue] = useState("");

  async function submitUrl(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const ok = await onAdd(trimmed);
    if (ok) setValue("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submitUrl(value);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <input
        type="url"
        inputMode="url"
        autoComplete="url"
        placeholder="Paste a URL — Enter to add"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none ring-ring transition placeholder:text-muted-foreground focus:border-ring focus:ring-2 disabled:opacity-50"
      />
    </form>
  );
}
