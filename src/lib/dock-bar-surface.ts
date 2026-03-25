/**
 * Bottom dock: same palette as the app (`card`), slightly translucent so
 * `backdrop-blur` can pick up content behind — no tinted gradient overlays.
 */
export const dockBarShell =
  "relative rounded-xl border border-border bg-card/90 shadow-lg backdrop-blur-xl";

export const dockDropdownSurface =
  "rounded-lg border border-border bg-card/95 py-1 text-card-foreground shadow-lg backdrop-blur-md";
