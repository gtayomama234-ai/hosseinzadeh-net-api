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

        const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

        let match;

        while ((match = linkRegex.exec(html)) !== null) {
          let href = match[1];

          let title = match[2]
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          if (!title || title.length < 15) {
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

          seen.add(href);

          articles.push({
            title,
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
