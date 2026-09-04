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

  return match
    ? match.substring(name.length + 1)
    : null;
}

async function getSession(req) {
  const encrypted = getCookie(
    req,
    "tiktok_session"
  );

  if (!encrypted) throw new Error("NO_SESSION");

  const session = decryptSession(encrypted);

  if (
    !session.access_token ||
    Date.now() >= session.expires_at
  ) {
    throw new Error("SESSION_EXPIRED");
  }

  return session;
}

async function queryCreator(accessToken) {
  const response = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
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
      "Creator Info failed"
    );
  }

  return result.data;
}

export default async function handler(req, res) {
  try {
    const session = await getSession(req);

    // ==========================
    // PAGE DE PUBLICATION
    // ==========================

    if (req.method === "GET") {
      const creator = await queryCreator(
        session.access_token
      );

      const options =
        creator.privacy_level_options || [];

      const privacyHtml = options
        .map(
          option =>
            `<option value="${option}">
              ${option}
            </option>`
        )
        .join("");

      return res.status(200).send(`
<!DOCTYPE html>
<html lang="fr">

<head>
<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
/>

<title>Psycho Curieux</title>
</head>

<body style="
font-family:Arial;
max-width:560px;
margin:40px auto;
padding:20px;
">

<h1>Publication test TikTok</h1>

<p>
Compte :
<strong>
${
  creator.creator_nickname ||
  creator.creator_username
}
</strong>
</p>

<p>
Choisis une petite vidéo pour ce premier test.
</p>

<form id="publishForm">

<label>Vidéo MP4 ou MOV</label>

<br><br>

<input
  id="video"
  type="file"
  accept="video/mp4,video/quicktime,.mp4,.mov"
  required
/>

<br><br>

<label>Légende</label>

<br><br>

<textarea
  id="caption"
  maxlength="2200"
  style="width:100%;height:100px;"
  placeholder="Une meilleure version de toi est toujours possible. 🧠✨ #PsychoCurieux"
></textarea>

<br><br>

<label>Confidentialité</label>

<br><br>

<select
  id="privacy"
  required
  style="width:100%;padding:10px;"
>

<option value="">
Choisir une option
</option>

${privacyHtml}

</select>

<br><br>

<label>
<input
  id="aigc"
  type="checkbox"
/>

Cette vidéo contient du contenu généré par IA
</label>

<br><br>

<label>
<input
  id="consent"
  type="checkbox"
  required
/>

Je confirme vouloir envoyer cette vidéo sur TikTok.
</label>

<br><br>

<button
  type="submit"
  style="
  width:100%;
  padding:15px;
  font-size:18px;
  "
>
Publier sur TikTok
</button>

</form>

<p
  id="status"
  style="
  margin-top:25px;
  font-weight:bold;
  "
></p>

<script>

const form =
  document.getElementById("publishForm");

const statusBox =
  document.getElementById("status");

form.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    const file =
      document.getElementById("video").files[0];

    const caption =
      document.getElementById("caption").value;

    const privacy =
      document.getElementById("privacy").value;

    const isAigc =
      document.getElementById("aigc").checked;

    if (!file) {
      statusBox.textContent =
        "Choisis une vidéo.";
      return;
    }

    const allowedTypes = [
      "video/mp4",
      "video/quicktime"
    ];

    if (
      file.type &&
      !allowedTypes.includes(file.type)
    ) {
      statusBox.textContent =
        "Utilise une vidéo MP4 ou MOV.";
      return;
    }

    if (file.size > 64 * 1024 * 1024) {
      statusBox.textContent =
        "Choisis une vidéo de moins de 64 Mo.";
      return;
    }

    statusBox.textContent =
      "Initialisation de la publication...";

    try {

      const initResponse = await fetch(
        "/api/publish",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            action: "init",
            video_size: file.size,
            caption: caption,
            privacy_level: privacy,
            is_aigc: isAigc
          })
        }
      );

      const initData =
        await initResponse.json();

      if (!initResponse.ok) {
        statusBox.textContent =
          "❌ " +
          (
            initData.error ||
            "Erreur d'initialisation."
          );

        return;
      }

      statusBox.textContent =
        "Envoi de la vidéo vers TikTok...";

      const uploadResponse = await fetch(
        initData.upload_url,
        {
          method: "PUT",

          headers: {
            "Content-Type":
              file.type ||
              "application/octet-stream",

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
        statusBox.textContent =
          "❌ Envoi de la vidéo échoué.";

        return;
      }

      statusBox.textContent =
        "TikTok traite la publication...";

      for (let i = 0; i < 12; i++) {

        await new Promise(
          resolve =>
            setTimeout(resolve, 5000)
        );

        const statusResponse =
          await fetch(
            "/api/publish",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body: JSON.stringify({
                action: "status",
                publish_id:
                  initData.publish_id
              })
            }
          );

        const statusData =
          await statusResponse.json();

        if (!statusResponse.ok) {
          statusBox.textContent =
            "❌ " +
            (
              statusData.error ||
              "Erreur de statut."
            );

          return;
        }

        if (
          statusData.status ===
          "PUBLISH_COMPLETE"
        ) {
          statusBox.textContent =
            "✅ PUBLICATION TIKTOK RÉUSSIE !";

          return;
        }

        if (
          statusData.status === "FAILED"
        ) {
          statusBox.textContent =
            "❌ TikTok a refusé la publication : " +
            (
              statusData.fail_reason ||
              "raison inconnue"
            );

          return;
        }

        statusBox.textContent =
          "TikTok traite la vidéo : " +
          statusData.status;
      }

      statusBox.textContent =
        "⏳ Toujours en traitement. Vérifie TikTok dans quelques instants.";

    } catch (error) {

      statusBox.textContent =
        "❌ Erreur : " + error.message;
    }
  }
);

</script>

</body>
</html>
      `);
    }

    // ==========================
    // API
    // ==========================

    if (req.method === "POST") {
      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body;

      // INITIALISATION
      if (body.action === "init") {

        const creator =
          await queryCreator(
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
            error:
              "Confidentialité invalide."
          });
        }

        const videoSize =
          Number(body.video_size);

        if (
          !Number.isFinite(videoSize) ||
          videoSize <= 0 ||
          videoSize >
            64 * 1024 * 1024
        ) {
          return res.status(400).json({
            error:
              "Taille vidéo invalide."
          });
        }

        const response = await fetch(
          "https://open.tiktokapis.com/v2/post/publish/video/init/",
          {
            method: "POST",

            headers: {
              Authorization:
                \`Bearer \${session.access_token}\`,

              "Content-Type":
                "application/json; charset=UTF-8"
            },

            body: JSON.stringify({

              post_info: {

                title:
                  body.caption || "",

                privacy_level:
                  body.privacy_level,

                disable_duet:
                  !!creator.duet_disabled,

                disable_comment:
                  !!creator.comment_disabled,

                disable_stitch:
                  !!creator.stitch_disabled,

                is_aigc:
                  !!body.is_aigc
              },

              source_info: {

                source:
                  "FILE_UPLOAD",

                video_size:
                  videoSize,

                chunk_size:
                  videoSize,

                total_chunk_count:
                  1
              }
            })
          }
        );

        const result =
          await response.json();

        if (
          !response.ok ||
          (
            result.error &&
            result.error.code !== "ok"
          )
        ) {
          return res.status(400).json({
            error:
              result.error?.message ||
              result.error?.code ||
              "TikTok Direct Post init failed."
          });
        }

        return res.status(200).json({
          publish_id:
            result.data.publish_id,

          upload_url:
            result.data.upload_url
        });
      }

      // STATUT
      if (body.action === "status") {

        const response = await fetch(
          "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
          {
            method: "POST",

            headers: {
              Authorization:
                \`Bearer \${session.access_token}\`,

              "Content-Type":
                "application/json; charset=UTF-8"
            },

            body: JSON.stringify({
              publish_id:
                body.publish_id
            })
          }
        );

        const result =
          await response.json();

        if (
          !response.ok ||
          (
            result.error &&
            result.error.code !== "ok"
          )
        ) {
          return res.status(400).json({
            error:
              result.error?.message ||
              result.error?.code ||
              "Erreur TikTok."
          });
        }

        return res.status(200).json({
          status:
            result.data.status,

          fail_reason:
            result.data.fail_reason || null
        });
      }

      return res.status(400).json({
        error: "Action inconnue."
      });
    }

    return res.status(405).send(
      "Method not allowed."
    );

  } catch (error) {

    console.error(error);

    if (error.message === "NO_SESSION") {
      return res.status(401).send(
        "Reconnecte ton compte TikTok."
      );
    }

    if (
      error.message ===
      "SESSION_EXPIRED"
    ) {
      return res.status(401).send(
        "Session expirée. Reconnecte TikTok."
      );
    }

    return res.status(500).send(
      "Server error."
    );
  }
}
