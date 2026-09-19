export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/status") {
      return Response.json({
        service: "Hosseinzadeh-Net",
        status: "online",
        version: "2.0.0"
      });
    }

    if (url.pathname === "/news/iranintl") {
      return handleIranInternational(request, ctx);
    }

    if (url.pathname === "/news/voa") {
      return handleVOA(request, ctx);
    }

    if (url.pathname === "/news/all") {
      return handleAllNews(request, ctx);
    }

    return Response.json({
      service: "Hosseinzadeh-Net",
      error: "Endpoint not found"
    }, {
      status: 404
    });
  }
};


async function handleAllNews(request, ctx) {
  try {
    const [
      iranIntlResponse,
      voaResponse
    ] = await Promise.all([
      fetch(
        new Request(
          new URL(
            "/news/iranintl",
            request.url
          ),
          request
        )
      ),
      fetch(
        new Request(
          new URL(
            "/news/voa",
            request.url
          ),
          request
        )
      )
    ]);

    const iranIntl =
      await iranIntlResponse.json();

    const voa =
      await voaResponse.json();

    const articles = [
      ...(iranIntl.articles || []),
      ...(voa.articles || [])
    ];

    articles.sort(
      (a, b) => {
        const aTime =
          Date.parse(
            a.published || ""
          ) || 0;

        const bTime =
          Date.parse(
            b.published || ""
          ) || 0;

        return bTime - aTime;
      }
    );

    return Response.json({
      service: "Hosseinzadeh-Net",
      source: "all",
      count: articles.length,
      cached_for: "5 minutes",
      articles
    }, {
      headers: {
        "Cache-Control":
          "public, max-age=300"
      }
    });

  } catch {
    return Response.json({
      service: "Hosseinzadeh-Net",
      source: "all",
      error:
        "Failed to combine news sources"
    }, {
      status: 502
    });
  }
}


async function handleVOA(
  request,
  ctx
) {
  const cache =
    caches.default;

  const cacheKey =
    new Request(
      "https://hosseinzadeh-net-api-cache/news/voa"
    );

  const cached =
    await cache.match(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    /*
     * VOA's official Persian RSS page lists
     * the available RSS feeds.
     *
     * This URL is the Persian top-stories
     * feed endpoint used by the VOA site.
     */
    const rssURL =
      "https://ir.voanews.com/api/z-p7x9i1";

    let response =
      await fetch(
        rssURL,
        {
          headers: {
            "User-Agent":
              "Hosseinzadeh-Net/2.0",
            "Accept":
              "application/rss+xml, application/xml, text/xml, */*"
          }
        }
      );

    /*
     * If the RSS endpoint changes or returns
     * something other than XML, fall back to
     * the official VOA Persian homepage.
     */
    if (!response.ok) {
      return await handleVOAHTML(
        ctx,
        cache,
        cacheKey
      );
    }

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    const rss =
      await response.text();

    if (
      !contentType.includes(
        "xml"
      ) &&
      !rss.includes(
        "<rss"
      ) &&
      !rss.includes(
        "<feed"
      )
    ) {
      return await handleVOAHTML(
        ctx,
        cache,
        cacheKey
      );
    }

    const articles =
      parseRSS(
        rss,
        "VOA Persian",
        "fa"
      );

    if (
      articles.length === 0
    ) {
      return await handleVOAHTML(
        ctx,
        cache,
        cacheKey
      );
    }

    const result =
      Response.json({
        service:
          "Hosseinzadeh-Net",
        source:
          "VOA Persian",
        language:
          "fa",
        count:
          articles.length,
        cached_for:
          "5 minutes",
        articles
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

  } catch {
    return await handleVOAHTML(
      ctx,
      cache,
      cacheKey
    );
  }
}


async function handleVOAHTML(
  ctx,
  cache,
  cacheKey
) {
  try {
    const response =
      await fetch(
        "https://ir.voanews.com/",
        {
          headers: {
            "User-Agent":
              "Hosseinzadeh-Net/2.0"
          }
        }
      );

    if (!response.ok) {
      return Response.json({
        service:
          "Hosseinzadeh-Net",
        source:
          "VOA Persian",
        error:
          `VOA returned HTTP ${response.status}`
      }, {
        status: 502
      });
    }

    const html =
      await response.text();

    const articles = [];
    const seen =
      new Set();

    const linkRegex =
      /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while (
      (match =
        linkRegex.exec(
          html
        )) !== null
    ) {
      let href =
        match[1];

      if (
        href.startsWith("/")
      ) {
        href =
          "https://ir.voanews.com" +
          href;
      }

      if (
        !href.startsWith(
          "https://ir.voanews.com/"
        )
      ) {
        continue;
      }

      if (
        href.includes(
          "/rss"
        ) ||
        href.includes(
          "/podcasts"
        ) ||
        href.includes(
          "/navigation/"
        )
      ) {
        continue;
      }

      if (
        !/^https:\/\/ir\.voanews\.com\/a\/[^?#]+/.test(
          href
        )
      ) {
        continue;
      }

      if (
        seen.has(href)
      ) {
        continue;
      }

      const title =
        cleanHTML(
          match[2]
        );

      if (
        !title ||
        title.length < 10
      ) {
        continue;
      }

      seen.add(href);

      articles.push({
        source:
          "VOA Persian",
        language:
          "fa",
        title,
        description:
          null,
        published:
          null,
        url:
          href
      });

      if (
        articles.length >= 20
      ) {
        break;
      }
    }

    const result =
      Response.json({
        service:
          "Hosseinzadeh-Net",
        source:
          "VOA Persian",
        language:
          "fa",
        count:
          articles.length,
        cached_for:
          "5 minutes",
        articles
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

  } catch {
    return Response.json({
      service:
        "Hosseinzadeh-Net",
      source:
        "VOA Persian",
      error:
        "Failed to fetch VOA Persian"
    }, {
      status: 502
    });
  }
}


function parseRSS(
  xml,
  source,
  language
) {
  const articles = [];
  const seen = new Set();

  const itemRegex =
    /<item\b[\s\S]*?<\/item>/gi;

  const items =
    xml.match(
      itemRegex
    ) || [];

  for (
    const item of items
  ) {
    const title =
      getXMLValue(
        item,
        "title"
      );

    const description =
      getXMLValue(
        item,
        "description"
      );

    const link =
      getXMLValue(
        item,
        "link"
      );

    const published =
      getXMLValue(
        item,
        "pubDate"
      ) ||
      getXMLValue(
        item,
        "published"
      ) ||
      getXMLValue(
        item,
        "updated"
      );

    if (
      !title ||
      !link
    ) {
      continue;
    }

    const decodedURL =
      decodeHTML(
        link
      ).trim();

    if (
      seen.has(
        decodedURL
      )
    ) {
      continue;
    }

    seen.add(
      decodedURL
    );

    articles.push({
      source,
      language,
      title:
        cleanHTML(
          title
        ),
      description:
        cleanHTML(
          description
        ),
      published:
        normalizeDate(
          published
        ),
      url:
        decodedURL
    });

    if (
      articles.length >= 20
    ) {
      break;
    }
  }

  return articles;
}


function getXMLValue(
  xml,
  tag
) {
  const regex =
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );

  const match =
    xml.match(
      regex
    );

  if (!match) {
    return null;
  }

  return decodeHTML(
    match[1]
      .replace(
        /<!\[CDATA\[([\s\S]*?)\]\]>/gi,
        "$1"
      )
      .trim()
  );
}


function normalizeDate(
  value
) {
  if (!value) {
    return null;
  }

  const timestamp =
    Date.parse(
      value
    );

  if (
    Number.isNaN(
      timestamp
    )
  ) {
    return value;
  }

  return new Date(
    timestamp
  ).toISOString();
}


function cleanHTML(
  text
) {
  if (!text) {
    return null;
  }

  return decodeHTML(
    text
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        ""
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        ""
      )
      .replace(
        /<[^>]+>/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim()
  );
}


function decodeHTML(
  text
) {
  if (!text) {
    return "";
  }

  return text
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&#x27;/gi,
      "'"
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /&lt;/gi,
      "<"
    )
    .replace(
      /&gt;/gi,
      ">"
    )
    .replace(
      /&nbsp;/gi,
      " "
    )
    .replace(
      /&#x2F;/gi,
      "/"
    )
    .replace(
      /&#47;/gi,
      "/"
    );
}


async function handleIranInternational(
  request,
  ctx
) {
  const cache =
    caches.default;

  const cacheKey =
    new Request(
      "https://hosseinzadeh-net-api-cache/news/iranintl"
    );

  const cached =
    await cache.match(
      cacheKey
    );

  if (cached) {
    return cached;
  }

  try {
    const response =
      await fetch(
        "https://www.iranintl.com/en/latest",
        {
          headers: {
            "User-Agent":
              "Hosseinzadeh-Net/2.0"
          }
        }
      );

    if (!response.ok) {
      return Response.json({
        service:
          "Hosseinzadeh-Net",
        source:
          "Iran International",
        error:
          `Iran International returned HTTP ${response.status}`
      }, {
        status: 502
      });
    }

    const html =
      await response.text();

    const articles = [];
    const seen =
      new Set();

    const linkRegex =
      /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while (
      (match =
        linkRegex.exec(
          html
        )) !== null
    ) {
      let href =
        match[1];

      if (
        href.startsWith("/")
      ) {
        href =
          "https://www.iranintl.com" +
          href;
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

      if (
        seen.has(href)
      ) {
        continue;
      }

      seen.add(href);

      articles.push({
        url: href
      });

      if (
        articles.length >= 20
      ) {
        break;
      }
    }

    const articleResults =
      await Promise.all(
        articles.map(
          async (
            article
          ) => {
            try {
              const articleResponse =
                await fetch(
                  article.url,
                  {
                    headers: {
                      "User-Agent":
                        "Hosseinzadeh-Net/2.0"
                    }
                  }
                );

              if (
                !articleResponse.ok
              ) {
                return null;
              }

              const articleHTML =
                await articleResponse.text();

              function getMeta(
                property
              ) {
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
                  const pattern of
                    patterns
                ) {
                  const result =
                    articleHTML.match(
                      pattern
                    );

                  if (
                    result
                  ) {
                    return decodeHTML(
                      result[1]
                    ).trim();
                  }
                }

                return null;
              }

              const title =
                getMeta(
                  "og:title"
                ) ||
                getMeta(
                  "twitter:title"
                );

              const description =
                getMeta(
                  "og:description"
                ) ||
                getMeta(
                  "description"
                ) ||
                getMeta(
                  "twitter:description"
                );

              const published =
                getMeta(
                  "article:published_time"
                ) ||
                getMeta(
                  "datePublished"
                );

              if (!title) {
                return null;
              }

              return {
                source:
                  "Iran International",
                language:
                  "en",
                title,
                description,
                published,
                url:
                  article.url
              };

            } catch {
              return null;
            }
          }
        )
      );

    const finalArticles =
      articleResults.filter(
        article =>
          article !== null
      );

    const result =
      Response.json({
        service:
          "Hosseinzadeh-Net",
        source:
          "Iran International",
        language:
          "en",
        count:
          finalArticles.length,
        cached_for:
          "5 minutes",
        articles:
          finalArticles
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

  } catch {
    return Response.json({
      service:
        "Hosseinzadeh-Net",
      source:
        "Iran International",
      error:
        "Failed to fetch Iran International"
    }, {
      status: 502
    });
  }
}
