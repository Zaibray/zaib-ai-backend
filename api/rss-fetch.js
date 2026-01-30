import Parser from "rss-parser";

const parser = new Parser();

export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ success: false, error: "URL is required" });
    }

    // Auto RSS detect
    const rssUrl = url.includes("rss")
      ? url
      : `https://${url.replace(/\/$/, "")}/rss/index.xml`;

    const feed = await parser.parseURL(rssUrl);

    if (!feed?.items || feed.items.length === 0) {
      return res.status(404).json({
        success: false,
        error: "RSS loaded but no items found",
      });
    }

    const latest = feed.items[0];

    res.status(200).json({
      success: true,
      source: feed.title,
      rss: rssUrl,
      latest: {
        title: latest.title || "",
        description: latest.contentSnippet || latest.content || "",
        link: latest.link || "",
        pubDate: latest.pubDate || "",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
