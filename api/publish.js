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

async function getSession(req) {
  const encryptedSession = getCookie(
    req,
    "tiktok_session"
  );

  if (!encryptedSession) {
    throw new Error("NO_SESSION");
  }

  const session = decryptSession(encryptedSession);

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
    throw new Error(
      result.error?.message ||
      result.error?.code ||
      "CREATOR_INFO_FAILED"
    );
  }

  return result.data;
}

export default async function handler(req, res) {
  try {
    const session = await getSession(req);

    if (req.method === "GET") {
      const creator = await queryCreator(
        session.access_token
      );

      const privacyOptions =
        creator.privacy_level_options || [];

      const privacyHtml = privacyOptions
        .map(
          (option) =>
            `<option value="${option}">${option}</option>`
        )
        .join("");

      return res.status(200).send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport"
        content="width=device-width, initial-scale=1">
  <title>Publication TikTok - Psycho Curieux</title>
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
    <strong>${
      creator.creator_nickname ||
      creator.creator_username
    }</strong>
  </p>

  <p>
    Choisis une petite vidéo MP4 pour ce premier test.
  </p>

  <form id="publishForm">

    <label>Vidéo MP4</label><br><br>

    <input
      id="video"
      type="file"
      accept="video/mp4"
      required
    >

    <br><br>

    <label>Légende</label><br><br>

    <textarea
      id="caption"
      maxlength="2200"
      style="width:100%;height:100px;"
      placeholder="Exemple : Test Psycho Curieux #psychologie"
    ></textarea>

    <br><br>

    <label>Confidentialité</label><br><br>

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
      >
      Cette vidéo contient du contenu généré par IA
    </label>

    <br><br>

    <label>
      <input
        id="consent"
        type="checkbox"
        required
      >
      Je confirme vouloir envoyer cette vidéo
      sur TikTok.
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

  <p id="status"
     style="margin-top:25px;font-weight:bold;">
  </p>

<script>
const form = document.getElementById("publishForm");
const statusBox = document.getElementById("status");

form.addEventListener("submit", async (event) => {
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

  if (file.type !== "video/mp4") {
    statusBox.textContent =
      "Utilise une vidéo MP4.";
    return;
  }

  // On garde le premier test simple :
  // maximum 64 MB, donc un seul chunk.
  if (file.size > 64 * 1024 * 1024) {
    statusBox.textContent =
      "Pour ce test, choisis une vidéo de moins de 64 Mo.";
    return;
  }

  statusBox.textContent =
    "Initialisation de la publication...";

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
        caption,
        privacy_level: privacy,
        is_aigc: isAigc
      })
    }
  );

  const initData = await initResponse.json();

  if (!initResponse.ok) {
    statusBox.textContent =
      initData.error ||
      "Erreur lors de l'initialisation.";
    return;
  }

  statusBox.textContent =
    "Envoi de la vidéo vers TikTok...";

  const uploadResponse = await fetch(
    initData.upload_url,
    {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
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
      "L'envoi de la vidéo a échoué.";
    return;
  }

  statusBox.textContent =
    "Vidéo envoyée. TikTok traite la publication...";

  const publishId = initData.publish_id;

  for (let i = 0; i < 12; i++) {
    await new Promise(
      resolve => setTimeout(resolve, 5000)
    );

    const statusResponse = await fetch(
      "/api/publish",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "status",
          publish_id: publishId
        })
      }
    );

    const statusData =
      await statusResponse.json();

    if (!statusResponse.ok) {
      statusBox.textContent =
        statusData.error ||
        "Impossible de vérifier le statut.";
      return;
    }

    if (
      statusData.status ===
      "PUBLISH_COMPLETE"
    ) {
      statusBox.textContent =
        "✅ Publication TikTok terminée !";
      return;
    }

    if (
      statusData.status ===
      "FAILED"
    ) {
      statusBox.textContent =
        "❌ TikTok a refusé la publication : " +
        (statusData.fail_reason ||
         "raison inconnue");
      return;
    }

    statusBox.textContent =
      "TikTok traite encore la vidéo : " +
      statusData.status;
  }

  statusBox.textContent =
    "La vidéo est toujours en traitement. Vérifie TikTok dans quelques instants.";
});
</script>

</body>
</html>
      `);
    }

    if (req.method === "POST") {
      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body;

      if (body.action === "init") {
        const creator = await queryCreator(
          session.access_token
        );

        const allowedPrivacy =
          creator.privacy_level_options || [];

        if (
          !allowedPrivacy.includes(
            body.privacy_level
          )
        ) {
          return res.status(400).json({
            error:
              "Option de confidentialité invalide."
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
                `Bearer ${session.access_token}`,
              "Content-Type":
                "application/json; charset=UTF-8",
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
                source: "FILE_UPLOAD",
                video_size: videoSize,
                chunk_size: videoSize,
                total_chunk_count: 1
              }
            })
          }
        );

        const result =
          await response.json();

        if (
          !response.ok ||
          (result.error &&
           result.error.code !== "ok")
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

      if (body.action === "status") {
        const response = await fetch(
          "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${session.access_token}`,
              "Content-Type":
                "application/json; charset=UTF-8",
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
          (result.error &&
           result.error.code !== "ok")
        ) {
          return res.status(400).json({
            error:
              result.error?.message ||
              result.error?.code ||
              "TikTok status check failed."
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
        "TikTok session missing. Reconnect TikTok."
      );
    }

    if (
      error.message === "SESSION_EXPIRED"
    ) {
      return res.status(401).send(
        "TikTok session expired. Reconnect TikTok."
      );
    }

    return res.status(500).send(
      "Server error."
    );
  }
}
