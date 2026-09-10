/**
 * Bottom dock: same palette as the app (`card`), slightly translucent so
 * `backdrop-blur` can pick up content behind — no tinted gradient overlays.
 */
export const dockBarShell =
  "relative rounded-xl border border-border bg-card/90 shadow-lg backdrop-blur-xl";

/**
 * Menus that open off the dock are solid. Translucency suits the bar itself,
 * but a list of folder names over blurred link rows reads as noise.
 */
export const dockDropdownSurface =
  "rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl";
