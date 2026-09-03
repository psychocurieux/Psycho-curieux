export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(
      `TikTok authorization error: ${error_description || error}`
    );
  }

  if (!code) {
    return res.status(400).send("Missing TikTok authorization code.");
  }

  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    code: code,
    grant_type: "authorization_code",
    redirect_uri: process.env.TIKTOK_REDIRECT_URI,
  });

  try {
    const response = await fetch(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error("TikTok OAuth error:", data);
      return res.status(400).send(
        "TikTok connection failed. Check the server logs."
      );
    }

    // Never expose access_token or refresh_token in the browser.
    console.log("TikTok authorization successful.");

    return res.status(200).send(
      "✅ Psycho Curieux est connecté à TikTok !"
    );
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server error.");
  }
}
