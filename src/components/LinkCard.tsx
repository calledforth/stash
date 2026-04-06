"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { extractDomain } from "@/lib/links";
import type { Folder } from "@/lib/links-types";
import type { Link } from "@prisma/client";
import { Check, Copy, ExternalLink } from "lucide-react";

type LinkCardProps = {
  link: Link & { titleSource?: string | null };
  folder?: Folder;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onCopied?: () => void;
};

export const LinkCard = forwardRef<HTMLDivElement, LinkCardProps>(
  function LinkCard({ link, folder, selected, onToggleSelect, onCopied }, ref) {
    const title = link.title?.trim() || extractDomain(link.url);
    const [copied, setCopied] = useState(false);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
      return () => {
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      };
    }, []);

    async function handleCopy(e: React.MouseEvent) {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(link.url);
        setCopied(true);
        onCopied?.();
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
      } catch {
        /* ignore */
      }
    }

    return (
      <div
        ref={ref}
        onClick={() => onToggleSelect(link.id)}
        className={`group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-all duration-150 ${
          selected
            ? "bg-white/[0.04] ring-1 ring-inset ring-white/10"
            : "hover:bg-white/[0.03]"
        }`}
      >
        <div
          className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded transition-all duration-150 ${
            selected
              ? "border border-white/25 bg-accent"
              : "border border-white/15 group-hover:border-white/30"
          }`}
        >
          {selected && (
            <svg
              className="h-2.5 w-2.5 text-white"
              viewBox="0 0 10 10"
              fill="none"
              aria-hidden
            >
              <path
                d="M2 5.5L4 7.5L8 3"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
        {link.faviconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={link.faviconUrl}
            alt=""
            className="h-4 w-4 shrink-0 rounded-sm"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="h-4 w-4 shrink-0 rounded-sm bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {title}
            </span>
            {link.titleSource === "metadata" && (
              <span
                className="shrink-0 rounded-full border border-muted-foreground/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                title="Metadata title"
              >
                Meta
              </span>
            )}
            <span className="truncate text-xs text-muted-foreground">
              {extractDomain(link.url)}
            </span>
          </div>
        </div>
        <div
          className={`flex shrink-0 items-center gap-0.5 transition-opacity ${
            copied ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <button
            type="button"
            onClick={handleCopy}
            className={`rounded p-0.5 transition-colors hover:bg-secondary hover:text-foreground ${
              copied ? "text-foreground" : "text-muted-foreground"
            }`}
            aria-label={copied ? "Copied" : "Copy link"}
            title={copied ? "Copied" : "Copy link"}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Open in new tab"
            title="Open in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        {folder && (
          <span className="shrink-0 rounded-full bg-folder-tag px-2 py-0.5 text-xs text-folder-tag-foreground">
            {folder.name}
          </span>
        )}
      </div>
    );
  },
);
