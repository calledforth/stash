import { ThemeToggle } from "@/components/ThemeToggle";

// Streamed the moment the request hits the server, while the page is still
// waiting on the database. It reuses the board's frame so nothing jumps when
// the real rows swap in — only the grey bars change.

const FOLDER_WIDTHS = ["w-28", "w-24", "w-32", "w-24", "w-28"];
const ROW_WIDTHS = [
  "w-2/5",
  "w-3/5",
  "w-1/3",
  "w-1/2",
  "w-2/3",
  "w-2/5",
  "w-1/2",
  "w-1/3",
  "w-3/5",
  "w-2/5",
];

function Bar({ className }: { className: string }) {
  return (
    <span className={`block animate-pulse rounded bg-secondary ${className}`} />
  );
}

export default function Loading() {
  return (
    <div className="board" aria-busy="true" aria-label="Loading links">
      <aside
        className="fixed top-0 z-10 flex h-screen flex-col pb-6 pr-8 pt-5"
        style={{ width: "var(--rail)", left: "var(--inset)" }}
      >
        <h1 className="flex h-8 shrink-0 items-center px-2.5 text-base font-semibold lowercase text-foreground">
          stash
        </h1>
        <div className="mt-3 flex flex-col gap-0.5">
          <div className="flex h-8 items-center gap-2.5 px-2.5">
            <Bar className="h-3.5 w-3.5" />
            <Bar className="h-3 w-16" />
          </div>
          <span className="mb-1 mt-5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Folders
          </span>
          {FOLDER_WIDTHS.map((w, i) => (
            <div key={i} className="flex h-8 items-center gap-2.5 px-2.5">
              <Bar className="h-3.5 w-3.5" />
              <Bar className={`h-3 ${w}`} />
            </div>
          ))}
        </div>
      </aside>

      <main
        className="pb-28"
        style={{
          width: "var(--list)",
          marginLeft: "calc(var(--inset) + var(--rail))",
        }}
      >
        <div className="sticky top-0 z-20 bg-background pb-2 pt-5">
          <div className="mb-3 flex h-8 items-center justify-end gap-2">
            <p className="text-xs text-muted-foreground">
              Paste, organize, find.
            </p>
            <ThemeToggle />
          </div>
          <div className="h-[38px] w-full rounded-md border border-border bg-input" />
        </div>

        <div className="flex flex-col">
          {ROW_WIDTHS.map((w, i) => (
            <div key={i} className="flex h-9 items-center gap-3 px-3">
              <Bar className="h-[15px] w-[15px]" />
              <Bar className="h-4 w-4" />
              <Bar className={`h-3 ${w}`} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
