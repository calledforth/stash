"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <p className="text-lg font-medium text-foreground">Something went wrong</p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
