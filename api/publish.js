import crypto from "crypto";

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";

  const cookie = cookies
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(name + "="));

  if (!cookie) return null;

  return cookie.substring(name.length + 1);
}

function decryptSession(value) {
  const secret = process.env.TIKTOK_CLIENT_SECRET;

  if (!secret) {
    throw new Error("TIKTOK_CLIENT_SECRET missing");
  }

  const key = crypto
    .createHash("sha256")
    .update(secret)
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
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}

function getSession(req) {
  const encrypted = getCookie(req, "tiktok_session");

  if (!encrypted) {
    throw new Error("NO_SESSION");
  }

  const session = decryptSession(encrypted);

  if (!session.access_token) {
    throw new Error("NO_ACCESS_TOKEN");
  }

  return session;
}

async function getCreatorInfo(accessToken) {
  const response = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json; charset=UTF-8"
      }
    }
  );

  const result = await response.json();

  if (
    !response.ok ||
    (result.error && result.error.code !== "ok")
  ) {
    throw new Error(
      result.error?.message ||
      result.error?.code ||
      "Creator Info error"
    );
  }

  return result.data;
}

export default async function handler(req, res) {
  try {
    const session = getSession(req);

    if (req.method === "GET") {
      const creator = await getCreatorInfo(
        session.access_token
      );

      const options =
        creator.privacy_level_options || [];

      const optionHtml = options
        .map(function (option) {
          return (
            '<option value="' +
            option +
            '">' +
            option +
            "</option>"
          );
        })
        .join("");

      const nickname =
        creator.creator_nickname ||
        creator.creator_username ||
        "TikTok";

      const html =
        `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Psycho Curieux</title>
</head>

<body style="font-family:Arial;max-width:560px;margin:30px auto;padding:20px">

<h1>Publication test TikTok</h1>

<p>Compte : <strong>${nickname}</strong></p>

<form id="form">

<p>
<label>Vidéo</label><br><br>
<input
id="video"
type="file"
accept=".mp4,.mov,video/mp4,video/quicktime"
required>
</p>

<p>
<label>Légende</label><br><br>
<textarea
id="caption"
maxlength="2200"
style="width:100%;height:100px"
>Une meilleure version de toi est toujours possible. 🧠✨ #PsychoCurieux #Psychologie #Motivation</textarea>
</p>

<p>
<label>Confidentialité</label><br><br>
<select id="privacy" style="width:100%;padding:12px" required>
<option value="">Choisir</option>
${optionHtml}
</select>
</p>

<p>
<label>
<input id="aigc" type="checkbox">
Contenu généré avec l'IA
</label>
</p>

<p>
<label>
<input id="consent" type="checkbox" required>
Je confirme vouloir publier cette vidéo.
</label>
</p>

<button
type="submit"
style="width:100%;padding:15px;font-size:18px">
Publier sur TikTok
</button>

</form>

<p id="status" style="font-weight:bold;margin-top:25px"></p>

<script>

const form = document.getElementById("form");
const statusBox = document.getElementById("status");

form.addEventListener("submit", async function(event) {

  event.preventDefault();

  const file =
    document.getElementById("video").files[0];

  const caption =
    document.getElementById("caption").value;

  const privacy =
    document.getElementById("privacy").value;

  const aigc =
    document.getElementById("aigc").checked;

  if (!file) {
    statusBox.textContent = "❌ Choisis une vidéo.";
    return;
  }

  const name = file.name.toLowerCase();

  const valid =
    file.type === "video/mp4" ||
    file.type === "video/quicktime" ||
    name.endsWith(".mp4") ||
    name.endsWith(".mov");

  if (!valid) {
    statusBox.textContent =
      "❌ Utilise une vidéo MP4 ou MOV.";
    return;
  }

  statusBox.textContent =
    "⏳ Initialisation TikTok...";

  try {

    const initResponse = await fetch(
      "/api/publish",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "init",
          video_size: file.size,
          caption: caption,
          privacy_level: privacy,
          is_aigc: aigc
        })
      }
    );

    const initData = await initResponse.json();

    if (!initResponse.ok) {
      throw new Error(
        initData.error || "Initialisation échouée"
      );
    }

    statusBox.textContent =
      "⬆️ Envoi de la vidéo...";

    let contentType = file.type;

    if (!contentType) {
      contentType = name.endsWith(".mov")
        ? "video/quicktime"
        : "video/mp4";
    }

    const uploadResponse = await fetch(
      initData.upload_url,
      {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Content-Range":
            "bytes 0-" +
            (file.size - 1) +
            "/" +
            file.size
        },
        body: file
      }
    );

    if (!uploadResponse.ok) {
      throw new Error(
        "L'envoi de la vidéo vers TikTok a échoué."
      );
    }

    statusBox.textContent =
      "⏳ TikTok traite la vidéo...";

    for (let i = 0; i < 15; i++) {

      await new Promise(function(resolve) {
        setTimeout(resolve, 4000);
      });

      const statusResponse = await fetch(
        "/api/publish",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: "status",
            publish_id: initData.publish_id
          })
        }
      );

      const statusData =
        await statusResponse.json();

      if (!statusResponse.ok) {
        throw new Error(
          statusData.error ||
          "Erreur lors de la vérification."
        );
      }

      if (
        statusData.status ===
        "PUBLISH_COMPLETE"
      ) {
        statusBox.textContent =
          "✅ PUBLICATION TIKTOK RÉUSSIE !";
        return;
      }

      if (statusData.status === "FAILED") {
        statusBox.textContent =
          "❌ TikTok a refusé la vidéo : " +
          (statusData.fail_reason || "raison inconnue");
        return;
      }

      statusBox.textContent =
        "⏳ TikTok : " + statusData.status;
    }

    statusBox.textContent =
      "⏳ Toujours en traitement.";

  } catch (error) {
    statusBox.textContent =
      "❌ " + error.message;
  }
});

</script>

</body>
</html>`;

      return res.status(200).send(html);
    }

    if (req.method === "POST") {
      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body;

      if (body.action === "init") {
        const creator = await getCreatorInfo(
          session.access_token
        );

        const privacyOptions =
          creator.privacy_level_options || [];

        if (
          !privacyOptions.includes(
            body.privacy_level
          )
        ) {
          return res.status(400).json({
            error: "Confidentialité invalide."
          });
        }

        const size = Number(body.video_size);

        if (!size || size <= 0) {
          return res.status(400).json({
            error: "Taille vidéo invalide."
          });
        }

        const tikTokResponse = await fetch(
          "https://open.tiktokapis.com/v2/post/publish/video/init/",
          {
            method: "POST",
            headers: {
              Authorization:
                "Bearer " + session.access_token,
              "Content-Type":
                "application/json; charset=UTF-8"
            },
            body: JSON.stringify({
              post_info: {
                title: body.caption || "",
                privacy_level:
                  body.privacy_level,
                disable_duet:
                  Boolean(creator.duet_disabled),
                disable_comment:
                  Boolean(creator.comment_disabled),
                disable_stitch:
                  Boolean(creator.stitch_disabled),
                is_aigc:
                  Boolean(body.is_aigc)
              },
              source_info: {
                source: "FILE_UPLOAD",
                video_size: size,
                chunk_size: size,
                total_chunk_count: 1
              }
            })
          }
        );

        const result =
          await tikTokResponse.json();

        if (
          !tikTokResponse.ok ||
          (result.error &&
            result.error.code !== "ok")
        ) {
          return res.status(400).json({
            error:
              result.error?.message ||
              result.error?.code ||
              "TikTok a refusé l'initialisation."
          });
        }

        return res.status(200).json({
          publish_id:
            result.data.publish_id,
          upload_url:
            result.data.upload_url
        });
      }

      if (body.action === "status") {
        const tikTokResponse = await fetch(
          "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
          {
            method: "POST",
            headers: {
              Authorization:
                "Bearer " + session.access_token,
              "Content-Type":
                "application/json; charset=UTF-8"
            },
            body: JSON.stringify({
              publish_id: body.publish_id
            })
          }
        );

        const result =
          await tikTokResponse.json();

        if (
          !tikTokResponse.ok ||
          (result.error &&
            result.error.code !== "ok")
        ) {
          return res.status(400).json({
            error:
              result.error?.message ||
              result.error?.code ||
              "Erreur TikTok."
          });
        }

        return res.status(200).json({
          status: result.data.status,
          fail_reason:
            result.data.fail_reason || null
        });
      }

      return res.status(400).json({
        error: "Action inconnue."
      });
    }

    return res.status(405).send(
      "Method not allowed"
    );

  } catch (error) {
    console.error(error);

    if (
      error.message === "NO_SESSION" ||
      error.message === "NO_ACCESS_TOKEN"
    ) {
      return res.status(401).send(
        "Reconnecte ton compte TikTok."
      );
    }

    return res.status(500).send(
      "Erreur serveur : " + error.message
    );
  }
}
