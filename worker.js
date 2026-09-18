export default {
  async fetch(request) {
    return new Response("Hello World from Hosseinzadeh-Net!", {
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
};
