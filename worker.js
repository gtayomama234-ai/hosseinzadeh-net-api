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

        return new Response(await response.text(), {
          headers: {
            "Content-Type": "text/html; charset=utf-8"
          }
        });
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
