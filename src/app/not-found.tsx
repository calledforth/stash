import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-2 bg-background px-6 py-24 text-center text-foreground">
      <p className="text-lg font-medium text-foreground">Page not found</p>
      <p className="text-sm text-muted-foreground">
        <Link
          href="/"
          className="text-muted-foreground underline hover:text-foreground"
        >
          Back to stash
        </Link>
      </p>
    </div>
  );
}
