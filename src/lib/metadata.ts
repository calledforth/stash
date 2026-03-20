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
};

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
      return { title: null, description: null, faviconUrl: null };
    }
    const html = await res.text();
    const finalUrl = res.url || url;

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

    return { title, description, faviconUrl };
  } catch {
    return { title: null, description: null, faviconUrl: null };
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
