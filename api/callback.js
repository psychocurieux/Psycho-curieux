import crypto from "crypto";

function encryptSession(data) {
  const key = crypto
    .createHash("sha256")
    .update(process.env.TIKTOK_CLIENT_SECRET)
    .digest();

  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    key,
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return Buffer.concat([
    iv,
    tag,
    encrypted
  ]).toString("base64url");
}

export default async function handler(req, res) {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(
      `TikTok authorization error: ${
        error_description || error
      }`
    );
  }

  if (!code) {
    return res
      .status(400)
      .send("Missing TikTok authorization code.");
  }

  try {
    const body = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: process.env.TIKTOK_REDIRECT_URI,
    });

    const response = await fetch(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      return res.status(400).send(
        `TikTok connection failed: ${
          data.error_description ||
          data.error ||
          "Unknown error"
        }`
      );
    }

    const session = encryptSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      open_id: data.open_id,
      expires_at:
        Date.now() +
        (data.expires_in || 86400) * 1000,
    });

    res.setHeader(
      "Set-Cookie",
      `tiktok_session=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${
        data.expires_in || 86400
      }`
    );

    return res.redirect("/api/creator");
  } catch (err) {
    console.error(err);

    return res
      .status(500)
      .send("Server error.");
  }
}
