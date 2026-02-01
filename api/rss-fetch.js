export const config = { runtime: "nodejs" };

import Parser from "rss-parser";
import * as cheerio from "cheerio"; // ✅ FIXED (no default import)

const parser = new Parser({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,*/*;q=0.8",
  },
  timeout: 20000,
});

function normalizeToHttps(input) {
  let u = String(input || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  u = u.replace(/\/$/, "");
  return u;
}

async function fetchText(url) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
    return await res.text();
  } finally {
    clearTimeout(id);
  }
}

function extractRssLinksFromHtml(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = [];

  $('link[rel="alternate"]').each((_, el) => {
    const type = String($(el).attr("type") || "").toLowerCase();
    const href = $(el).attr("href");
    if (!href) return;

    if (type.includes("rss") || type.includes("atom") || type.includes("xml")) {
      try {
        links.push(new URL(href, baseUrl).toString());
      } catch {}
    }
  });

  $('a[href*="rss"], a[href*="feed"], a[href*=".xml"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      links.push(new URL(href, baseUrl).toString());
    } catch {}
  });

  return Array.from(new Set(links));
}

async function tryParseAny(urls) {
  let lastErr = null;
  for (const u of urls) {
    try {
      const feed = await parser.parseURL(u);
      if (feed?.items?.length) return { feed, rssUrl: u };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("No valid RSS feeds found");
}

export default async function handler(req, res) {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ success: false, error: "URL is required" });

    const base = normalizeToHttps(url);
    if (!base) return res.status(400).json({ success: false, error: "Invalid URL" });

    const looksLikeRss = /(\.xml|rss|feed|atom)/i.test(base);

    if (looksLikeRss) {
      const { feed } = await tryParseAny([base]);
      const latest = feed.items[0];
      return res.status(200).json({
        success: true,
        item: {
          title: latest.title || "No Title",
          url: latest.link || base,
          publishedAt: latest.pubDate || new Date().toISOString(),
          description: latest.contentSnippet || latest.content || "",
          cleanText: latest.contentSnippet || latest.content || "",
        },
      });
    }

    const html = await fetchText(base);
    const discovered = extractRssLinksFromHtml(html, base);

    const guesses = [
      `${base}/feed`,
      `${base}/rss`,
      `${base}/rss.xml`,
      `${base}/feed.xml`,
      `${base}/atom.xml`,
      `${base}/index.xml`,
      `${base}/feeds`,
      `${base}/feeds/posts/default?alt=rss`,
    ];

    const { feed, rssUrl } = await tryParseAny([...discovered, ...guesses]);
    const latest = feed.items[0];

    return res.status(200).json({
      success: true,
      source: feed.title || base,
      rss: rssUrl,
      item: {
        title: latest.title || "No Title",
        url: latest.link || base,
        publishedAt: latest.pubDate || new Date().toISOString(),
        description: latest.contentSnippet || latest.content || "",
        cleanText: latest.contentSnippet || latest.content || "",
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Unknown error",
    });
  }
}
