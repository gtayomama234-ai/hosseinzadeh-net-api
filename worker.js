export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/status") {
      return Response.json({
        service: "Hosseinzadeh-Net",
        status: "online",
        version: "3.0.0"
      });
    }

    if (url.pathname === "/news/iranintl") {
      return handleIranInternational(
        request,
        ctx
      );
    }

    if (url.pathname === "/news/voa") {
      return handleVOA(
        request,
        ctx
      );
    }

    if (url.pathname === "/news/all") {
      return handleAllNews(
        request,
        ctx
      );
    }

    if (url.pathname === "/games") {
      return handleGames(env);
    }

    if (
      url.pathname.startsWith("/games/") &&
      url.pathname.endsWith(".torrent")
    ) {
      return handleTorrent(
        request,
        env
      );
    }

    return Response.json({
      service: "Hosseinzadeh-Net",
      error: "Endpoint not found"
    }, {
      status: 404
    });
  }
};


async function handleAllNews(
  request,
  ctx
) {
  try {
    const [
      iranIntlResponse,
      voaResponse
    ] = await Promise.all([
      handleIranInternational(
        request,
        ctx
      ),
      handleVOA(
        request,
        ctx
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

    return Response.json({
      service:
        "Hosseinzadeh-Net",
      source:
        "all",
      count:
        articles.length,
      providers: [
        "Iran International",
        "VOA Persian"
      ],
      articles
    }, {
      headers: {
        "Cache-Control":
          "public, max-age=300"
      }
    });

  } catch (error) {
    return Response.json({
      service:
        "Hosseinzadeh-Net",
      source:
        "all",
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
      "https://hosseinzadeh-net-api-cache/news/voa-v3"
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
        "https://ir.voanews.com/",
        {
          headers: {
            "User-Agent":
              "Hosseinzadeh-Net/3.0",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language":
              "fa-IR,fa;q=0.9,en;q=0.8"
          }
        }
      );

    if (!response.ok) {
      return Response.json({
        service:
          "Hosseinzadeh-Net",
        source:
          "VOA Persian",
        language:
          "fa",
        error:
          `VOA returned HTTP ${response.status}`
      }, {
        status: 502
      });
    }

    const html =
      await response.text();

    const links = [];
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
        normalizeURL(
          match[1]
        );

      if (!href) {
        continue;
      }

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
        ) ||
        href.includes(
          "/z/"
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
        seen.has(
          href
        )
      ) {
        continue;
      }

      const title =
        cleanHTML(
          match[2]
        );

      if (
        !title ||
        title.length < 8
      ) {
        continue;
      }

      seen.add(
        href
      );

      links.push({
        title,
        url:
          href
      });

      if (
        links.length >= 20
      ) {
        break;
      }
    }

    const articleResults =
      await Promise.all(
        links.map(
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
                        "Hosseinzadeh-Net/3.0",
                      "Accept":
                        "text/html,application/xhtml+xml"
                    }
                  }
                );

              if (
                !articleResponse.ok
              ) {
                return {
                  source:
                    "VOA Persian",
                  language:
                    "fa",
                  title:
                    cleanText(
                      article.title
                    ),
                  description:
                    null,
                  url:
                    article.url
                };
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
                    return cleanText(
                      result[1]
                    );
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
                ) ||
                cleanText(
                  article.title
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

              return {
                source:
                  "VOA Persian",
                language:
                  "fa",
                title:
                  cleanText(
                    title
                  ),
                description:
                  cleanText(
                    description
                  ),
                url:
                  article.url
              };

            } catch {
              return {
                source:
                  "VOA Persian",
                language:
                  "fa",
                title:
                  cleanText(
                    article.title
                  ),
                description:
                  null,
                url:
                  article.url
              };
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
          "VOA Persian",
        language:
          "fa",
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

  } catch (error) {
    return Response.json({
      service:
        "Hosseinzadeh-Net",
      source:
        "VOA Persian",
      language:
        "fa",
      error:
        "Failed to fetch VOA Persian"
    }, {
      status: 502
    });
  }
}


async function handleIranInternational(
  request,
  ctx
) {
  const cache =
    caches.default;

  const cacheKey =
    new Request(
      "https://hosseinzadeh-net-api-cache/news/iranintl-v3"
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
              "Hosseinzadeh-Net/3.0",
            "Accept":
              "text/html,application/xhtml+xml"
          }
        }
      );

    if (!response.ok) {
      return Response.json({
        service:
          "Hosseinzadeh-Net",
        source:
          "Iran International",
        language:
          "en",
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
        seen.has(
          href
        )
      ) {
        continue;
      }

      seen.add(
        href
      );

      articles.push({
        url:
          href
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
                        "Hosseinzadeh-Net/3.0"
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

              if (!title) {
                return null;
              }

              return {
                source:
                  "Iran International",
                language:
                  "en",
                title:
                  cleanText(
                    title
                  ),
                description:
                  cleanText(
                    description
                  ),
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

  } catch (error) {
    return Response.json({
      service:
        "Hosseinzadeh-Net",
      source:
        "Iran International",
      language:
        "en",
      error:
        "Failed to fetch Iran International"
    }, {
      status: 502
    });
  }
}


async function handleGames(
  env
) {
  try {
    const repo =
      env.GITHUB_REPO;

    if (!repo) {
      return Response.json({
        service:
          "Hosseinzadeh-Net",
        source:
          "torrent-games",
        error:
          "GITHUB_REPO is not configured"
      }, {
        status: 500
      });
    }

    const response =
      await fetch(
        `https://api.github.com/repos/${repo}/contents/repository/torrents`,
        {
          headers: {
            "User-Agent":
              "Hosseinzadeh-Net",
            "Accept":
              "application/vnd.github+json"
          }
        }
      );

    if (!response.ok) {
      return Response.json({
        service:
          "Hosseinzadeh-Net",
        source:
          "torrent-games",
        error:
          `GitHub returned HTTP ${response.status}`
      }, {
        status: 502
      });
    }

    const files =
      await response.json();

    const games =
      files
        .filter(
          file =>
            file.type === "file" &&
            file.name
              .toLowerCase()
              .endsWith(".torrent")
        )
        .map(
          file => ({
            name:
              file.name.replace(
                /\.torrent$/i,
                ""
              ),
            filename:
              file.name,
            torrent:
              `/games/${encodeURIComponent(
                file.name
              )}`
          })
        );

    return Response.json({
      service:
        "Hosseinzadeh-Net",
      source:
        "torrent-games",
      count:
        games.length,
      games
    }, {
      headers: {
        "Cache-Control":
          "public, max-age=300"
      }
    });

  } catch (error) {
    return Response.json({
      service:
        "Hosseinzadeh-Net",
      source:
        "torrent-games",
      error:
        "Failed to load torrent game index"
    }, {
      status: 502
    });
  }
}


async function handleTorrent(
  request,
  env
) {
  try {
    const url =
      new URL(
        request.url
      );

    const filename =
      decodeURIComponent(
        url.pathname.substring(
          "/games/".length
        )
      );

    if (
      !filename ||
      !filename
        .toLowerCase()
        .endsWith(".torrent") ||
      filename.includes("/") ||
      filename.includes("\\") ||
      filename.includes("..")
    ) {
      return new Response(
        "Invalid torrent filename",
        {
          status: 400
        }
      );
    }

    const repo =
      env.GITHUB_REPO;

    if (!repo) {
      return new Response(
        "GITHUB_REPO is not configured",
        {
          status: 500
        }
      );
    }

    const torrentURL =
      `https://raw.githubusercontent.com/${repo}/main/repository/torrents/${encodeURIComponent(filename)}`;

    const response =
      await fetch(
        torrentURL,
        {
          headers: {
            "User-Agent":
              "Hosseinzadeh-Net"
          }
        }
      );

    if (!response.ok) {
      return new Response(
        "Torrent not found",
        {
          status: 404
        }
      );
    }

    return new Response(
      response.body,
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/x-bittorrent",
          "Content-Disposition":
            `attachment; filename="${filename}"`,
          "Cache-Control":
            "public, max-age=3600"
        }
      }
    );

  } catch (error) {
    return new Response(
      "Failed to fetch torrent",
      {
        status: 502
      }
    );
  }
}


function normalizeURL(
  value
) {
  if (!value) {
    return null;
  }

  let url =
    value.trim();

  const markdownMatch =
    url.match(
      /^\[.*?\]\((https?:\/\/[^)]+)\)$/
    );

  if (markdownMatch) {
    url =
      markdownMatch[1];
  }

  return decodeHTML(
    url
  ).trim();
}


function cleanText(
  text
) {
  if (!text) {
    return null;
  }

  return decodeHTML(
    String(text)
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
        /[\r\n\t]+/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim()
  );
}


function cleanHTML(
  text
) {
  return cleanText(
    text
  );
}


function decodeHTML(
  text
) {
  if (!text) {
    return "";
  }

  return String(text)
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
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, hex) =>
        String.fromCodePoint(
          parseInt(
            hex,
            16
          )
        )
    )
    .replace(
      /&#([0-9]+);/g,
      (_, decimal) =>
        String.fromCodePoint(
          parseInt(
            decimal,
            10
          )
        )
    );
}
