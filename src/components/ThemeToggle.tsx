"use client";

import { THEME_STORAGE_KEY } from "@/lib/theme";
import { Moon, Sun } from "lucide-react";

/**
 * Deliberately stateless. The current theme lives on <html> — written by the
 * boot script before hydration — so reading it into React state would either
 * mismatch on hydration or need an effect to correct itself. Instead the click
 * handler reads the DOM, and CSS picks which icon to show.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    root.style.colorScheme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private mode — the theme just won't persist */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      title="Toggle theme"
      aria-label="Toggle theme"
    >
      <Sun className="hidden h-3.5 w-3.5 dark:block" aria-hidden />
      <Moon className="block h-3.5 w-3.5 dark:hidden" aria-hidden />
    </button>
  );
}
