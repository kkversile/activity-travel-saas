import { Injectable } from '@nestjs/common';

export type ActivityResearchSource = { title: string; url: string; snippet: string };
export type ActivityResearchImage = { url: string; sourceUrl: string };
export type ActivityResearchPacket = { query: string; sources: ActivityResearchSource[]; imageCandidates: ActivityResearchImage[] };

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
}

function decodeRedirectUrl(value: string) {
  try {
    const decoded = decodeURIComponent(value);
    const match = decoded.match(/[?&]uddg=([^&]+)/i);
    return match ? decodeURIComponent(match[1]) : decoded;
  } catch { return value; }
}

function isHttpUrl(value: unknown): value is string { return typeof value === 'string' && /^https:\/\//i.test(value); }
function isLikelyImageUrl(value: unknown) { return isHttpUrl(value) && (/\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(value) || /(?:googleusercontent\.com|ggpht\.com|images\.|image\.|img\.)/i.test(value)); }

@Injectable()
export class ActivityAiResearchService {
  private async fetchText(url: string, headers: Record<string, string> = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'VOYA Vendor Console research lookup', accept: 'text/html,application/json', ...headers }, signal: controller.signal });
      if (!response.ok) return '';
      return await response.text();
    } catch { return ''; }
    finally { clearTimeout(timeout); }
  }

  private parseInstantAnswer(raw: string, sources: ActivityResearchSource[]) {
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as any;
      const add = (title: unknown, url: unknown, snippet: unknown) => {
        if (!isHttpUrl(url)) return;
        const cleanUrl = decodeRedirectUrl(url);
        if (!isHttpUrl(cleanUrl) || sources.some((source) => source.url === cleanUrl)) return;
        sources.push({ title: String(title || 'Web result').slice(0, 160), url: cleanUrl, snippet: String(snippet || '').slice(0, 500) });
      };
      add(payload.Heading, payload.AbstractURL, payload.AbstractText);
      const visit = (topics: unknown[]) => topics.forEach((topic: any) => { if (sources.length >= 8 || !topic) return; if (Array.isArray(topic.Topics)) visit(topic.Topics); else add(topic.Text, topic.FirstURL, topic.Text); });
      visit(Array.isArray(payload.RelatedTopics) ? payload.RelatedTopics : []);
    } catch { /* HTML search is the fallback. */ }
  }

  private parseHtmlResults(raw: string, sources: ActivityResearchSource[]) {
    const resultPattern = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while (sources.length < 8 && (match = resultPattern.exec(raw))) {
      const url = decodeRedirectUrl(match[1]);
      if (!isHttpUrl(url) || sources.some((source) => source.url === url)) continue;
      const context = raw.slice(match.index, match.index + 2200);
      const snippetMatch = context.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\//i);
      sources.push({ title: stripHtml(match[2]).slice(0, 160), url, snippet: stripHtml(snippetMatch?.[1] || '').slice(0, 500) });
    }
  }

  private async searchImages(query: string): Promise<ActivityResearchImage[]> {
    const landingUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
    const landing = await this.fetchText(landingUrl);
    const token = landing.match(/vqd["']?\s*[:=]\s*["']([\d-]+)["']/i)?.[1] || landing.match(/vqd=([\d-]+)/i)?.[1];
    if (!token) return [];
    const raw = await this.fetchText(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(token)}`, { referer: landingUrl, accept: 'application/json' });
    try {
      const payload = JSON.parse(raw) as any;
      return (Array.isArray(payload.results) ? payload.results : []).map((item: any) => ({ url: item?.image, sourceUrl: item?.url || item?.source })).filter((item: ActivityResearchImage) => isLikelyImageUrl(item.url) && isHttpUrl(item.sourceUrl)).filter((item: ActivityResearchImage, index: number, items: ActivityResearchImage[]) => items.findIndex((candidate) => candidate.url === item.url) === index).slice(0, 5);
    } catch { return []; }
  }

  async search(activityName: string, context: { city?: string; state?: string; country?: string; category?: string } = {}): Promise<ActivityResearchPacket> {
    const name = activityName.trim();
    const location = [context.city, context.state, context.country].filter((value) => typeof value === 'string' && value.trim()).join(' ');
    const category = typeof context.category === 'string' ? context.category.trim() : '';
    const query = [name, category, location].filter(Boolean).join(' ').trim();
    if (!name) return { query: '', sources: [], imageCandidates: [] };
    const searchQuery = [`"${name}"`, category, location].filter(Boolean).join(' ').trim();
    const mapsQuery = [`"${name}"`, location, 'address Google Maps'].filter(Boolean).join(' ').trim();
    const encoded = encodeURIComponent(searchQuery);
    const encodedMapsQuery = encodeURIComponent(mapsQuery);
    const [instant, html, mapsHtml, imageCandidates] = await Promise.all([
      this.fetchText(`https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`),
      this.fetchText(`https://html.duckduckgo.com/html/?q=${encoded}`),
      this.fetchText(`https://html.duckduckgo.com/html/?q=${encodedMapsQuery}`),
      this.searchImages(query),
    ]);
    const sources: ActivityResearchSource[] = [];
    this.parseInstantAnswer(instant, sources);
    this.parseHtmlResults(html, sources);
    this.parseHtmlResults(mapsHtml, sources);
    return { query, sources, imageCandidates };
  }
}
