import crypto from "crypto";

function decryptSession(value) {
  const key = crypto
    .createHash("sha256")
    .update(process.env.TIKTOK_CLIENT_SECRET)
    .digest();

  const raw = Buffer.from(value, "base64url");

  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    iv
  );

  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";

  const match = cookies
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + "="));

  if (!match) return null;

  return match.substring(name.length + 1);
}

export default async function handler(req, res) {
  try {
    const encryptedSession = getCookie(
      req,
      "tiktok_session"
    );

    if (!encryptedSession) {
      return res.status(401).send(
        "TikTok session missing. Please connect again."
      );
    }

    const session = decryptSession(encryptedSession);

    if (
      !session.access_token ||
      Date.now() >= session.expires_at
    ) {
      return res.status(401).send(
        "TikTok session expired. Please connect again."
      );
    }

    const response = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type":
            "application/json; charset=UTF-8",
        },
      }
    );

    const result = await response.json();

    if (
      !response.ok ||
      (result.error && result.error.code !== "ok")
    ) {
      return res.status(400).send(
        `Creator Info failed: ${
          result.error?.message ||
          result.error?.code ||
          "Unknown TikTok error"
        }`
      );
    }

    const creator = result.data;

    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Psycho Curieux</title>
        </head>

        <body style="font-family:Arial;padding:30px;text-align:center;">
          <h1>✅ TikTok connecté</h1>

          <p>
            Compte :
            <strong>${creator.creator_nickname || creator.creator_username}</strong>
          </p>

          <p>
            Creator Info fonctionne correctement.
          </p>

          <p>
            Durée vidéo maximale :
            ${creator.max_video_post_duration_sec || "Non indiquée"} secondes
          </p>

          <a href="/api/publish">
            Continuer vers la publication test
          </a>
        </body>
      </html>
    `);
  } catch (error) {
    console.error(error);

    return res.status(500).send(
      "Server error while reading TikTok Creator Info."
    );
  }
}
