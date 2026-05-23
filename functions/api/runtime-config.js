module.exports = async (req, res) => {
  if (req.method && req.method !== "GET") {
    res.statusCode = 405;
    return res.json({ success: false, message: "Method Not Allowed" });
  }

  const env = process.env || {};
  const previewBypassLoginRaw = String(env.PREVIEW_BYPASS_LOGIN || "").toLowerCase() === "true";
  const context = String(env.CONTEXT || env.NETLIFY_CONTEXT || env.NODE_ENV || "").toLowerCase();
  const isProduction = context === "production";

  return res.json({
    success: true,
    previewBypassLogin: previewBypassLoginRaw && !isProduction,
    context
  });
};
