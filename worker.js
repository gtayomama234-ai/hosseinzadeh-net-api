export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/status") {
      return Response.json({
        service: "Hosseinzadeh-Net",
        status: "online",
        version: "1.3.0"
      });
    }

    if (url.pathname === "/youtubeapi") {
      let target = url.searchParams.get("url");

      if (!target) {
        target = "https://www.youtube.com/";
      }

      let targetURL;

      try {
        targetURL = new URL(target);
      } catch {
        return Response.json({
          service: "Hosseinzadeh-Net",
          source: "YouTube",
          error: "Invalid URL"
        }, {
          status: 400
        });
      }

      const allowedHosts = [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "www.youtube-nocookie.com",
        "youtube-nocookie.com"
      ];

      if (
        targetURL.protocol !== "https:" ||
        !allowedHosts.includes(targetURL.hostname)
      ) {
        return Response.json({
          service: "Hosseinzadeh-Net",
          source: "YouTube",
          error: "Only YouTube URLs are allowed"
        }, {
          status: 400
        });
      }

      try {
        const youtubeResponse = await fetch(
          targetURL.toString(),
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36",
              "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9"
            },
            redirect: "follow"
          }
        );

        if (!youtubeResponse.ok) {
          return new Response(
            `YouTube returned HTTP ${youtubeResponse.status}`,
            {
              status: youtubeResponse.status,
              headers: {
                "Content-Type": "text/plain; charset=UTF-8"
              }
            }
          );
        }

        let html = await youtubeResponse.text();

        const proxyBase =
          "https://hosseinzadeh-net-api.hoss-rasa234.workers.dev/youtubeapi";

        function proxyURL(value) {
          if (!value) {
            return value;
          }

          if (
            value.startsWith("#") ||
            value.startsWith("data:") ||
            value.startsWith("javascript:") ||
            value.startsWith("mailto:")
          ) {
            return value;
          }

          try {
            const absolute = new URL(
              value,
              targetURL.toString()
            );

            if (
              absolute.hostname === "www.youtube.com" ||
              absolute.hostname === "youtube.com" ||
              absolute.hostname === "m.youtube.com" ||
              absolute.hostname === "music.youtube.com"
            ) {
              return (
                proxyBase +
                "?url=" +
                encodeURIComponent(absolute.toString())
              );
            }

            return value;
          } catch {
            return value;
          }
        }

        html = html.replace(
          /(\s(?:href|src|action)=["'])([^"']+)(["'])/gi,
          (full, prefix, value, suffix) => {
            return (
              prefix +
              proxyURL(value) +
              suffix
            );
          }
        );

        html = html.replace(
          /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
          (full, quote, value) => {
            const rewritten = proxyURL(value);

            return `url(${quote}${rewritten}${quote})`;
          }
        );

        html = html.replace(
          /https:\/\/(?:www\.)?youtube\.com/gi,
          proxyBase + "?url=" +
            encodeURIComponent("https://www.youtube.com")
        );

        html = html.replace(
          /https:\/\/m\.youtube\.com/gi,
          proxyBase + "?url=" +
            encodeURIComponent("https://m.youtube.com")
        );

        html = html.replace(
          /<base[^>]*>/gi,
          ""
        );

        const injection = `
<script>
(function() {
  const proxy =
    "${proxyBase}?url=";

  function rewriteURL(value) {
    if (!value) return value;

    if (
      value.startsWith("#") ||
      value.startsWith("data:") ||
      value.startsWith("javascript:")
    ) {
      return value;
    }

    try {
      const u = new URL(value, location.href);

      if (
        u.hostname === "www.youtube.com" ||
        u.hostname === "youtube.com" ||
        u.hostname === "m.youtube.com" ||
        u.hostname === "music.youtube.com"
      ) {
        return proxy + encodeURIComponent(u.toString());
      }
    } catch {}

    return value;
  }

  document.addEventListener(
    "click",
    function(event) {
      const link = event.target.closest("a");

      if (!link) return;

      const href = link.getAttribute("href");

      if (!href) return;

      const rewritten = rewriteURL(href);

      if (rewritten !== href) {
        event.preventDefault();
        location.href = rewritten;
      }
    },
    true
  );

  const originalFetch = window.fetch;

  window.fetch = function(input, init) {
    try {
      if (typeof input === "string") {
        input = rewriteURL(input);
      } else if (
        input &&
        input.url
      ) {
        input = rewriteURL(input.url);
      }
    } catch {}

    return originalFetch.call(
      this,
      input,
      init
    );
  };

  const originalOpen =
    XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.open =
    function(method, requestURL) {
      arguments[1] =
        rewriteURL(requestURL);

      return originalOpen.apply(
        this,
        arguments
      );
    };
})();
</script>
`;

        html = html.replace(
          /<\/head>/i,
          injection + "</head>"
        );

        return new Response(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=UTF-8",
            "Cache-Control": "no-store",
            "X-Hosseinzadeh-Net-Proxy": "YouTube"
          }
        });

      } catch (error) {
        return Response.json({
          service: "Hosseinzadeh-Net",
          source: "YouTube",
          error: "Failed to fetch YouTube"
        }, {
          status: 502
        });
      }
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
            error:
              `Iran International returned HTTP ${response.status}`
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
            href =
              "https://www.iranintl.com" + href;
          }

          if (
            !href.startsWith(
              "https://www.iranintl.com/en/"
            )
          ) {
            continue;
          }

          if (
            !/^https:\/\/www\.iranintl\.com\/en\/\d{10,}$/.test(
              href
            )
          ) {
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

        const articleResults =
          await Promise.all(
            articles.map(
              async (article) => {
                try {
                  const articleResponse =
                    await fetch(
                      article.url,
                      {
                        headers: {
                          "User-Agent":
                            "Hosseinzadeh-Net/1.1"
                        }
                      }
                    );

                  if (!articleResponse.ok) {
                    return null;
                  }

                  const articleHTML =
                    await articleResponse.text();

                  function getMeta(property) {
                    const escaped =
                      property.replace(
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

                    for (
                      const pattern of patterns
                    ) {
                      const result =
                        articleHTML.match(
                          pattern
                        );

                      if (result) {
                        return decodeHTML(
                          result[1]
                        ).trim();
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
                    getMeta(
                      "twitter:description"
                    );

                  const published =
                    getMeta(
                      "article:published_time"
                    ) ||
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
              }
            )
          );

        const finalArticles =
          articleResults.filter(
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
            "Cache-Control":
              "public, max-age=300"
          }
        });

        ctx.waitUntil(
          cache.put(
            cacheKey,
            result.clone()
          )
        );

        return result;

      } catch (error) {
        return Response.json({
          service: "Hosseinzadeh-Net",
          source: "Iran International",
          error:
            "Failed to fetch Iran International"
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
