export function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.filter(Boolean);
  } catch {}
  return [raw];
}

export function serializeImages(urls: string[]): string {
  return JSON.stringify(urls.filter(Boolean));
}
