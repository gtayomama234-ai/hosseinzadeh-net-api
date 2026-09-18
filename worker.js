export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/status") {
      return Response.json({
        service: "Hosseinzadeh-Net",
        status: "online",
        version: "1.0.0"
      });
    }

        if (url.pathname === "/news/iranintl") {
      try {
        const response = await fetch("https://www.iranintl.com/en/latest");

        if (!response.ok) {
          return Response.json({
            service: "Hosseinzadeh-Net",
            source: "Iran International",
            error: `Iran International returned HTTP ${response.status}`
          }, {
            status: 502
          });
        }

        const html = await response.text();

        const articles = [];
        const seen = new Set();

        const debugMatch = html.match(
          /<a[^>]+href="https:\/\/www\.iranintl\.com\/en\/2026[^"]*"[^>]*>[\s\S]{0,5000}<\/a>/i
        );

        if (debugMatch) {
          return new Response(debugMatch[0], {
            headers: {
              "Content-Type": "text/html; charset=utf-8"
            }
          });
        }

        function decodeHTML(text) {
          return text
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/gi, "'")
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&nbsp;/g, " ")
            .replace(/&#x2F;/gi, "/")
            .replace(/&#47;/g, "/");
        }

        const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

        let match;

        while ((match = linkRegex.exec(html)) !== null) {
          let href = match[1];

          let text = match[2]
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          text = decodeHTML(text);

          if (!text || text.length < 15) {
            continue;
          }

          if (href.startsWith("/")) {
            href = "https://www.iranintl.com" + href;
          }

          if (!href.startsWith("https://www.iranintl.com/")) {
            continue;
          }

          if (seen.has(href)) {
            continue;
          }

          const dateRegex =
            /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4},\s+\d{2}:\d{2}\s+GMT[+-]\d+/;

          const dateMatch = text.match(dateRegex);

          let published = null;
          let articleText = text;

          if (dateMatch) {
            published = dateMatch[0];
            articleText = text
              .replace(dateRegex, "")
              .replace(/\s+/g, " ")
              .trim();
          }

          let title = articleText;
          let description = null;

          const sentenceEnd = articleText.search(/[.!?]\s+/);

          if (sentenceEnd !== -1) {
            title = articleText.slice(0, sentenceEnd + 1).trim();
            description = articleText.slice(sentenceEnd + 1).trim();

            if (!description) {
              description = null;
            }
          }

          seen.add(href);

          articles.push({
            title,
            description,
            published,
            url: href
          });

          if (articles.length >= 30) {
            break;
          }
        }

        return Response.json({
          service: "Hosseinzadeh-Net",
          source: "Iran International",
          language: "en",
          count: articles.length,
          articles
        });

      } catch (error) {
        return Response.json({
          service: "Hosseinzadeh-Net",
          source: "Iran International",
          error: "Failed to parse Iran International"
        }, {
          status: 502
        });
      }
    }

    return Response.json({
      service: "Hosseinzadeh-Net",
      error: "Endpoint not found"
    }, {
      status: 404
    });
  }
};
