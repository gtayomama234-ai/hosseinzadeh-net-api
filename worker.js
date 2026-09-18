export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/status") {
      return Response.json({
        service: "Hosseinzadeh-Net",
        status: "online",
        version: "1.1.0"
      });
    }

    if (url.pathname === "/news/iranintl") {
      const cache = caches.default;
      const cacheKey = new Request(
        "https://hosseinzadeh-net-api-cache/news/iranintl"
      );

      const cached = await cache.match(cacheKey);

      if (cached) {
        return cached;
      }

      try {
        const response = await fetch(
          "https://www.iranintl.com/en/latest",
          {
            headers: {
              "User-Agent": "Hosseinzadeh-Net/1.1"
            }
          }
        );

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

        const linkRegex =
          /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

        let match;

        while ((match = linkRegex.exec(html)) !== null) {
          let href = match[1];

          if (href.startsWith("/")) {
            href = "https://www.iranintl.com" + href;
          }

          if (!href.startsWith("https://www.iranintl.com/en/")) {
            continue;
          }

          if (!/^https:\/\/www\.iranintl\.com\/en\/\d{10,}$/.test(href)) {
            continue;
          }

          if (seen.has(href)) {
            continue;
          }

          seen.add(href);

          articles.push({
            url: href
          });

          if (articles.length >= 20) {
            break;
          }
        }

        const articleResults = await Promise.all(
          articles.map(async (article) => {
            try {
              const articleResponse = await fetch(
                article.url,
                {
                  headers: {
                    "User-Agent": "Hosseinzadeh-Net/1.1"
                  }
                }
              );

              if (!articleResponse.ok) {
                return null;
              }

              const articleHTML = await articleResponse.text();

              function getMeta(property) {
                const escaped = property.replace(
                  /[.*+?^${}()|[\]\\]/g,
                  "\\$&"
                );

                const patterns = [
                  new RegExp(
                    `<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
                    "i"
                  ),
                  new RegExp(
                    `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["']`,
                    "i"
                  ),
                  new RegExp(
                    `<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
                    "i"
                  ),
                  new RegExp(
                    `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["']`,
                    "i"
                  )
                ];

                for (const pattern of patterns) {
                  const result = articleHTML.match(pattern);

                  if (result) {
                    return decodeHTML(result[1]).trim();
                  }
                }

                return null;
              }

              const title =
                getMeta("og:title") ||
                getMeta("twitter:title");

              const description =
                getMeta("og:description") ||
                getMeta("description") ||
                getMeta("twitter:description");

              const published =
                getMeta("article:published_time") ||
                getMeta("datePublished");

              if (!title) {
                return null;
              }

              return {
                title,
                description,
                published,
                url: article.url
              };

            } catch {
              return null;
            }
          })
        );

        const finalArticles = articleResults.filter(
          (article) => article !== null
        );

        const result = Response.json({
          service: "Hosseinzadeh-Net",
          source: "Iran International",
          language: "en",
          count: finalArticles.length,
          cached_for: "5 minutes",
          articles: finalArticles
        }, {
          headers: {
            "Cache-Control": "public, max-age=300"
          }
        });

        ctx.waitUntil(
          cache.put(cacheKey, result.clone())
        );

        return result;

      } catch (error) {
        return Response.json({
          service: "Hosseinzadeh-Net",
          source: "Iran International",
          error: "Failed to fetch Iran International"
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
