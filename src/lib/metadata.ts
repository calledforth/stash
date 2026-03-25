function absolutizeUrl(base: string, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

export type LinkMetadata = {
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
  resolvedUrl: string;
  domain: string | null;
  sourceType: "youtube" | "web";
  sourceCreator: string | null;
};

type YouTubeOEmbed = {
  title?: string;
  author_name?: string;
};

function normalizeHost(host: string | null): string | null {
  if (!host) return null;
  const lower = host.toLowerCase();
  return lower.startsWith("www.") ? lower.slice(4) : lower;
}

function getSourceType(host: string | null): "youtube" | "web" {
  if (!host) return "web";
  return host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be"
    ? "youtube"
    : "web";
}

async function fetchYouTubeOEmbed(url: string): Promise<YouTubeOEmbed | null> {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  try {
    const res = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as YouTubeOEmbed;
    return json;
  } catch {
    return null;
  }
}

export async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Stash/1.0; +https://github.com/)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      return {
        title: null,
        description: null,
        faviconUrl: null,
        resolvedUrl: url,
        domain: normalizeHost(new URL(url).hostname),
        sourceType: getSourceType(normalizeHost(new URL(url).hostname)),
        sourceCreator: null,
      };
    }
    const html = await res.text();
    const finalUrl = res.url || url;
    let finalHost: string | null = null;
    try {
      finalHost = normalizeHost(new URL(finalUrl).hostname);
    } catch {
      finalHost = null;
    }

    const ogTitle =
      html.match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      )?.[1] ??
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      )?.[1];
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    const title = (ogTitle || titleTag || null)?.replace(/\s+/g, " ") ?? null;

    const ogDesc =
      html.match(
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      )?.[1] ??
      html.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      )?.[1];
    const description = ogDesc?.replace(/\s+/g, " ") ?? null;

    let faviconUrl: string | null = null;
    const iconHref =
      html.match(
        /<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i,
      )?.[1] ??
      html.match(
        /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon)["']/i,
      )?.[1];
    if (iconHref) {
      faviconUrl = absolutizeUrl(finalUrl, iconHref);
    } else {
      try {
        const u = new URL(finalUrl);
        faviconUrl = `${u.origin}/favicon.ico`;
      } catch {
        faviconUrl = null;
      }
    }

    const sourceType = getSourceType(finalHost);
    let sourceCreator: string | null = null;
    let finalTitle = title;
    let finalDescription = description;

    if (sourceType === "youtube") {
      const oembed = await fetchYouTubeOEmbed(finalUrl);
      if (oembed?.title?.trim()) {
        finalTitle = oembed.title.trim().replace(/\s+/g, " ");
      }
      if (oembed?.author_name?.trim()) {
        sourceCreator = oembed.author_name.trim();
        if (!finalDescription) {
          finalDescription = `YouTube video by ${sourceCreator}`;
        }
      }
    }

    return {
      title: finalTitle,
      description: finalDescription,
      faviconUrl,
      resolvedUrl: finalUrl,
      domain: finalHost,
      sourceType,
      sourceCreator,
    };
  } catch {
    return {
      title: null,
      description: null,
      faviconUrl: null,
      resolvedUrl: url,
      domain: null,
      sourceType: "web",
      sourceCreator: null,
    };
  } finally {
    clearTimeout(t);
  }
}

export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const withProto =
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u.href;
  } catch {
    return null;
  }
}
