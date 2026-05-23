module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    if (req.method && req.method !== "GET") {
      res.statusCode = 405;
      return res.end(JSON.stringify({ success: false, message: "Method Not Allowed" }));
    }

    const env = process.env || {};
    const previewBypassLoginRaw = String(env.PREVIEW_BYPASS_LOGIN || "").toLowerCase() === "true";
    const context = String(env.CONTEXT || env.NETLIFY_CONTEXT || env.NODE_ENV || "").toLowerCase();
    const environment = context || "unknown";

    return res.end(JSON.stringify({
      previewBypassLogin: previewBypassLoginRaw,
      environment
    }));
  } catch (error) {
    res.statusCode = 500;
    return res.end(JSON.stringify({
      success: false,
      message: "Failed to load runtime config"
    }));
  }
};
