export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/status") {
      return Response.json({
        service: "Hosseinzadeh-Net",
        status: "online",
        version: "1.4.0"
      });
    }

    if (
      url.pathname === "/youtubeapi" ||
      url.pathname.startsWith("/youtubeapi/")
    ) {
      return handleYouTube(request, url);
    }

    if (url.pathname === "/news/iranintl") {
      return handleIranInternational(request, ctx);
    }

    return Response.json({
      service: "Hosseinzadeh-Net",
      error: "Endpoint not found"
    }, {
      status: 404
    });
  }
};


async function handleYouTube(request, url) {
  const proxyOrigin = url.origin;

  let targetURL;

  if (url.pathname === "/youtubeapi") {
    const requestedURL = url.searchParams.get("url");

    if (requestedURL) {
      try {
        targetURL = new URL(requestedURL);
      } catch {
        return new Response("Invalid YouTube URL", {
          status: 400
        });
      }
    } else {
      targetURL = new URL("https://www.youtube.com/");
    }
  } else {
    const targetPath =
      url.pathname.replace(/^\/youtubeapi/, "") ||
      "/";

    targetURL = new URL(
      "https://www.youtube.com" + targetPath
    );

    targetURL.search = url.search;
  }

  const allowedHosts = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com"
  ]);

  if (
    targetURL.protocol !== "https:" ||
    !allowedHosts.has(targetURL.hostname)
  ) {
    return new Response(
      "Only YouTube hosts are permitted.",
      {
        status: 400
      }
    );
  }

  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.delete("content-length");

  headers.set(
    "User-Agent",
    request.headers.get("User-Agent") ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36"
  );

  headers.set(
    "Accept-Language",
    request.headers.get("Accept-Language") ||
      "en-US,en;q=0.9"
  );

  const upstreamRequest = new Request(
    targetURL.toString(),
    {
      method: request.method,
      headers,
      body:
        request.method === "GET" ||
        request.method === "HEAD"
          ? undefined
          : request.body,
      redirect: "manual"
    }
  );

  let response;

  try {
    response = await fetch(upstreamRequest);
  } catch {
    return new Response(
      "Unable to connect to YouTube.",
      {
        status: 502
      }
    );
  }

  const responseHeaders =
    new Headers(response.headers);

  responseHeaders.delete("content-security-policy");
  responseHeaders.delete("content-security-policy-report-only");
  responseHeaders.delete("x-frame-options");

  const location =
    responseHeaders.get("Location");

  if (location) {
    try {
      const redirectURL =
        new URL(
          location,
          targetURL.toString()
        );

      if (
        redirectURL.hostname === "youtube.com" ||
        redirectURL.hostname === "www.youtube.com" ||
        redirectURL.hostname === "m.youtube.com" ||
        redirectURL.hostname === "music.youtube.com"
      ) {
        const proxied =
          new URL(
            proxyOrigin + "/youtubeapi"
          );

        proxied.searchParams.set(
          "url",
          redirectURL.toString()
        );

        responseHeaders.set(
          "Location",
          proxied.toString()
        );
      }
    } catch {
      responseHeaders.delete("Location");
    }
  }

  const contentType =
    responseHeaders.get("content-type") || "";

  if (
    contentType.includes("text/html")
  ) {
    const rewriter =
      createYouTubeRewriter(
        targetURL,
        proxyOrigin
      );

    const transformed =
      rewriter.transform(response);

    return new Response(
      transformed.body,
      {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      }
    );
  }

  return new Response(
    response.body,
    {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    }
  );
}


function createYouTubeRewriter(
  targetURL,
  proxyOrigin
) {
  function rewrite(value) {
    if (!value) {
      return value;
    }

    if (
      value.startsWith("#") ||
      value.startsWith("data:") ||
      value.startsWith("blob:") ||
      value.startsWith("javascript:")
    ) {
      return value;
    }

    try {
      const absolute =
        new URL(
          value,
          targetURL.toString()
        );

      const youtubeHosts = new Set([
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com"
      ]);

      if (
        youtubeHosts.has(
          absolute.hostname
        )
      ) {
        const proxy =
          new URL(
            proxyOrigin +
            "/youtubeapi"
          );

        proxy.searchParams.set(
          "url",
          absolute.toString()
        );

        return proxy.toString();
      }

      return value;
    } catch {
      return value;
    }
  }


  class AttributeRewriter {
    constructor(attribute) {
      this.attribute = attribute;
    }

    element(element) {
      const value =
        element.getAttribute(
          this.attribute
        );

      if (!value) {
        return;
      }

      const rewritten =
        rewrite(value);

      if (rewritten !== value) {
        element.setAttribute(
          this.attribute,
          rewritten
        );
      }
    }
  }


  return new HTMLRewriter()
    .on(
      "a",
      new AttributeRewriter("href")
    )
    .on(
      "form",
      new AttributeRewriter("action")
    )
    .on(
      "img",
      new AttributeRewriter("src")
    )
    .on(
      "script",
      new AttributeRewriter("src")
    )
    .on(
      "link",
      new AttributeRewriter("href")
    )
    .on(
      "iframe",
      new AttributeRewriter("src")
    )
    .on(
      "video",
      new AttributeRewriter("src")
    )
    .on(
      "source",
      new AttributeRewriter("src")
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
    await cache.match(cacheKey);

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
              "Hosseinzadeh-Net/1.1"
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

    while (
      (match =
        linkRegex.exec(html)) !== null
    ) {
      let href =
        match[1];

      if (href.startsWith("/")) {
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
        (article) =>
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
