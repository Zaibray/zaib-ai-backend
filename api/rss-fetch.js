const RSS_PATHS = [
  "/rss",
  "/rss.xml",
  "/feed",
  "/feeds",
  "/feeds/news.xml",
  "/rss/index.xml"
];

function normalizeUrl(input) {
  if (!input.startsWith("http")) {
    return "https://" + input;
  }
  return input;
}

export default async function handler(req, res) {
  try {
    let { url } = req.query;

    if (!url) {
      return res.status(400).json({ success: false, error: "URL required" });
    }

    const baseUrl = normalizeUrl(url);

    let rssUrl = null;
    let xmlText = null;

    for (const path of RSS_PATHS) {
      try {
        const testUrl = baseUrl + path;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(testUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "Zaib.AI RSS Finder" }
        });

        clearTimeout(timeout);

        if (!response.ok) continue;

        const text = await response.text();
        if (text.includes("<rss") || text.includes("<feed")) {
          rssUrl = testUrl;
          xmlText = text;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!rssUrl) {
      return res.status(200).json({
        success: false,
        error: "No RSS feed found"
      });
    }

    const itemMatch = xmlText.match(/<item>([\s\S]*?)<\/item>/);
    if (!itemMatch) {
      return res.status(200).json({
        success: false,
        error: "No RSS items found"
      });
    }

    const item = itemMatch[1];

    const extract = (tag) => {
      const match = item.match(
        new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)
      );
      return match
        ? match[1].replace(/<!\\[CDATA\\[|\\]\\]>/g, "").trim()
        : "";
    };

    return res.status(200).json({
      success: true,
      rss: rssUrl,
      latest: {
        title: extract("title"),
        description: extract("description"),
        link: extract("link"),
        pubDate: extract("pubDate")
      }
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
