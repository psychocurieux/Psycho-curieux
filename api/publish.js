import crypto from "crypto";

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || "";
  const cookies = cookieHeader.split(";").map((c) => c.trim());

  for (const cookie of cookies) {
    const index = cookie.indexOf("=");
    if (index === -1) continue;

    const key = cookie.slice(0, index);
    const value = cookie.slice(index + 1);

    if (key === name) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

function decryptSession(encryptedValue) {
  const secret = process.env.TIKTOK_CLIENT_SECRET;

  if (!secret) {
    throw new Error("TIKTOK_CLIENT_SECRET manquant.");
  }

  const key = crypto.createHash("sha256").update(secret).digest();

  const parts = encryptedValue.split(".");
  if (parts.length !== 3) {
    throw new Error("Session invalide.");
  }

  const iv = Buffer.from(parts[0], "base64url");
  const tag = Buffer.from(parts[1], "base64url");
  const encrypted = Buffer.from(parts[2], "base64url");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8"));
}

function getSession(req) {
  const cookie = getCookie(req, "tiktok_session");

  if (!cookie) {
    throw new Error("Session TikTok absente. Reconnecte-toi.");
  }

  const session = decryptSession(cookie);

  if (!session.access_token) {
    throw new Error("Access token TikTok absent.");
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
        "Content-Type": "application/json; charset=UTF-8",
      },
    }
  );

  const json = await response.json();

  if (!response.ok || !json.error || json.error.code !== "ok") {
    const message =
      json?.error?.message ||
      json?.error?.code ||
      "Impossible de récupérer Creator Info.";

    throw new Error(message);
  }

  return json.data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderPage(creator) {
  const privacyOptions = (creator.privacy_level_options || [])
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
    )
    .join("");

  const maxDuration = Number(creator.max_video_post_duration_sec || 0);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, maximum-scale=1"
  />
  <title>Publication TikTok</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 0;
      background: #ffffff;
      color: #111111;
    }

    main {
      width: min(720px, 100%);
      margin: 0 auto;
      padding: 42px 22px 80px;
    }

    h1 {
      font-size: 38px;
      margin: 0 0 28px;
      line-height: 1.05;
    }

    h2 {
      font-size: 21px;
      margin: 30px 0 14px;
    }

    .account {
      font-size: 20px;
      margin-bottom: 30px;
    }

    label {
      display: block;
      font-size: 18px;
      margin: 18px 0 8px;
    }

    input[type="file"],
    textarea,
    select {
      width: 100%;
      font-size: 17px;
    }

    textarea {
      min-height: 130px;
      resize: vertical;
      padding: 12px;
      border: 1px solid #d5d5d5;
      border-radius: 12px;
    }

    select {
      padding: 16px;
      border-radius: 14px;
      border: 1px solid #d5d5d5;
      background: #f4f4f4;
    }

    video {
      display: none;
      width: 100%;
      max-height: 500px;
      margin-top: 18px;
      border-radius: 16px;
      background: #000;
    }

    .box {
      padding: 16px;
      border: 1px solid #dedede;
      border-radius: 14px;
      margin-top: 14px;
    }

    .check {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 12px 0;
      font-size: 17px;
    }

    .check input {
      width: 22px;
      height: 22px;
      flex: 0 0 auto;
      margin-top: 1px;
    }

    .disabled {
      opacity: 0.45;
    }

    .small {
      color: #666;
      font-size: 14px;
      line-height: 1.4;
    }

    .warning {
      color: #9a6200;
      font-size: 15px;
      margin-top: 10px;
    }

    .error {
      color: #c80000;
      font-weight: 700;
      margin-top: 20px;
      white-space: pre-wrap;
    }

    .success {
      color: #087b34;
      font-weight: 700;
      margin-top: 20px;
      white-space: pre-wrap;
    }

    button {
      width: 100%;
      border: 0;
      border-radius: 14px;
      padding: 17px;
      margin-top: 24px;
      font-size: 19px;
      background: #1677ff;
      color: white;
      font-weight: 600;
    }

    button:disabled {
      opacity: 0.45;
    }

    #commercialOptions {
      display: none;
      margin-top: 8px;
    }

    #commercialMessage {
      margin-top: 10px;
      font-size: 14px;
    }

    .consent {
      margin-top: 25px;
      padding: 14px;
      background: #f6f6f6;
      border-radius: 12px;
      line-height: 1.4;
    }
  </style>
</head>

<body>
<main>

  <h1>Publication TikTok</h1>

  <div class="account">
    Compte : <strong>${escapeHtml(creator.creator_nickname)}</strong>
  </div>

  <label for="videoFile">Vidéo</label>
  <input
    id="videoFile"
    type="file"
    accept=".mp4,.mov,video/mp4,video/quicktime"
  />

  <video id="preview" controls playsinline></video>

  <p class="small">
    Durée maximale autorisée pour ce compte :
    <strong>${maxDuration} secondes</strong>
  </p>

  <label for="title">Légende</label>
  <textarea
    id="title"
    maxlength="2200"
    placeholder="Écris ta légende TikTok..."
  >Une meilleure version de toi est toujours possible. 🧠✨ #PsychoCurieux #Psychologie #Motivation</textarea>

  <label for="privacy">Confidentialité</label>
  <select id="privacy">
    <option value="" selected disabled>Choisir la confidentialité</option>
    ${privacyOptions}
  </select>

  <h2>Interactions</h2>

  <div class="box">
    <label class="check ${
      creator.comment_disabled ? "disabled" : ""
    }">
      <input
        id="allowComment"
        type="checkbox"
        ${creator.comment_disabled ? "disabled" : ""}
      />
      <span>Autoriser les commentaires</span>
    </label>

    <label class="check ${
      creator.duet_disabled ? "disabled" : ""
    }">
      <input
        id="allowDuet"
        type="checkbox"
        ${creator.duet_disabled ? "disabled" : ""}
      />
      <span>Autoriser les Duos</span>
    </label>

    <label class="check ${
      creator.stitch_disabled ? "disabled" : ""
    }">
      <input
        id="allowStitch"
        type="checkbox"
        ${creator.stitch_disabled ? "disabled" : ""}
      />
      <span>Autoriser les Collages</span>
    </label>

    <p class="small">
      Les options indisponibles sont désactivées selon les paramètres du
      compte TikTok.
    </p>
  </div>

  <h2>Contenu commercial</h2>

  <div class="box">
    <label class="check">
      <input id="commercialToggle" type="checkbox" />
      <span>
        Ce contenu fait la promotion de moi-même, d'une marque,
        d'un produit ou d'un service
      </span>
    </label>

    <div id="commercialOptions">
      <label class="check">
        <input id="yourBrand" type="checkbox" />
        <span>Votre marque</span>
      </label>

      <label class="check" id="brandedRow">
        <input id="brandedContent" type="checkbox" />
        <span>Contenu de marque / partenariat rémunéré</span>
      </label>

      <div id="commercialMessage"></div>
    </div>
  </div>

  <h2>Informations du contenu</h2>

  <div class="box">
    <label class="check">
      <input id="isAigc" type="checkbox" />
      <span>Contenu généré avec l'IA</span>
    </label>
  </div>

  <div class="consent" id="consentText">
    By posting, you agree to TikTok's Music Usage Confirmation.
  </div>

  <label class="check">
    <input id="consent" type="checkbox" />
    <span>
      Je confirme avoir vérifié la vidéo, la légende et les paramètres
      ci-dessus, et je souhaite publier ce contenu sur TikTok.
    </span>
  </label>

  <p class="small">
    Après la publication, TikTok peut prendre quelques minutes pour traiter
    la vidéo et l'afficher sur le profil.
  </p>

  <button id="publishButton" type="button">
    Publier sur TikTok
  </button>

  <div id="status"></div>

</main>

<script>
  const MAX_DURATION = ${JSON.stringify(maxDuration)};

  const fileInput = document.getElementById("videoFile");
  const preview = document.getElementById("preview");
  const titleInput = document.getElementById("title");
  const privacy = document.getElementById("privacy");

  const allowComment = document.getElementById("allowComment");
  const allowDuet = document.getElementById("allowDuet");
  const allowStitch = document.getElementById("allowStitch");

  const commercialToggle = document.getElementById("commercialToggle");
  const commercialOptions = document.getElementById("commercialOptions");
  const yourBrand = document.getElementById("yourBrand");
  const brandedContent = document.getElementById("brandedContent");
  const brandedRow = document.getElementById("brandedRow");
  const commercialMessage = document.getElementById("commercialMessage");

  const isAigc = document.getElementById("isAigc");
  const consent = document.getElementById("consent");
  const consentText = document.getElementById("consentText");

  const publishButton = document.getElementById("publishButton");
  const status = document.getElementById("status");

  let videoDuration = 0;
  let previewUrl = null;

  function setStatus(message, type) {
    status.className = type || "";
    status.textContent = message;
  }

  function updateCommercialUI() {
    commercialOptions.style.display =
      commercialToggle.checked ? "block" : "none";

    const isSelfOnly = privacy.value === "SELF_ONLY";

    if (isSelfOnly) {
      brandedContent.checked = false;
      brandedContent.disabled = true;
      brandedRow.classList.add("disabled");
    } else {
      brandedContent.disabled = false;
      brandedRow.classList.remove("disabled");
    }

    if (!commercialToggle.checked) {
      commercialMessage.textContent = "";
      consentText.textContent =
        "By posting, you agree to TikTok's Music Usage Confirmation.";
      return;
    }

    if (brandedContent.checked) {
      consentText.textContent =
        "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.";
    } else {
      consentText.textContent =
        "By posting, you agree to TikTok's Music Usage Confirmation.";
    }

    if (yourBrand.checked && brandedContent.checked) {
      commercialMessage.textContent =
        "Votre vidéo sera étiquetée « Paid partnership ».";
    } else if (brandedContent.checked) {
      commercialMessage.textContent =
        "Votre vidéo sera étiquetée « Paid partnership ».";
    } else if (yourBrand.checked) {
      commercialMessage.textContent =
        "Votre vidéo sera étiquetée « Promotional content ».";
    } else {
      commercialMessage.textContent =
        "Vous devez indiquer si le contenu promeut votre marque, une autre marque, ou les deux.";
    }
  }

  commercialToggle.addEventListener("change", updateCommercialUI);
  yourBrand.addEventListener("change", updateCommercialUI);
  brandedContent.addEventListener("change", updateCommercialUI);
  privacy.addEventListener("change", updateCommercialUI);

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];

    videoDuration = 0;

    if (!file) {
      preview.style.display = "none";
      return;
    }

    const lowerName = file.name.toLowerCase();

    const supported =
      file.type === "video/mp4" ||
      file.type === "video/quicktime" ||
      lowerName.endsWith(".mp4") ||
      lowerName.endsWith(".mov");

    if (!supported) {
      fileInput.value = "";
      preview.style.display = "none";
      setStatus(
        "❌ Format non pris en charge. Choisis une vidéo MP4 ou MOV.",
        "error"
      );
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    preview.style.display = "block";

    preview.onloadedmetadata = () => {
      videoDuration = preview.duration;

      if (
        MAX_DURATION > 0 &&
        videoDuration > MAX_DURATION
      ) {
        setStatus(
          "❌ Cette vidéo dure " +
            Math.ceil(videoDuration) +
            " secondes. TikTok autorise maximum " +
            MAX_DURATION +
            " secondes pour ce compte.",
          "error"
        );
      } else {
        setStatus(
          "✅ Vidéo prête. Durée : " +
            Math.ceil(videoDuration) +
            " secondes.",
          "success"
        );
      }
    };
  });

  async function parseResponse(response) {
    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      return {
        error: text || "Réponse serveur invalide."
      };
    }
  }

  publishButton.addEventListener("click", async () => {
    try {
      setStatus("", "");

      const file = fileInput.files[0];

      if (!file) {
        throw new Error("Choisis d'abord une vidéo.");
      }

      if (!privacy.value) {
        throw new Error(
          "Choisis manuellement la confidentialité."
        );
      }

      if (
        MAX_DURATION > 0 &&
        videoDuration > MAX_DURATION
      ) {
        throw new Error(
          "La vidéo dépasse la durée maximale autorisée par TikTok."
        );
      }

      if (commercialToggle.checked) {
        if (!yourBrand.checked && !brandedContent.checked) {
          throw new Error(
            "Pour un contenu commercial, sélectionne « Votre marque », « Contenu de marque », ou les deux."
          );
        }

        if (
          brandedContent.checked &&
          privacy.value === "SELF_ONLY"
        ) {
          throw new Error(
            "Le contenu de marque ne peut pas être publié en SELF_ONLY."
          );
        }
      }

      if (!consent.checked) {
        throw new Error(
          "Tu dois confirmer la publication avant de continuer."
        );
      }

      publishButton.disabled = true;

      setStatus("⏳ Initialisation de la publication TikTok...", "");

      const initResponse = await fetch("/api/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "init",
          video_size: file.size,
          title: titleInput.value,
          privacy_level: privacy.value,

          allow_comment:
            !allowComment.disabled && allowComment.checked,

          allow_duet:
            !allowDuet.disabled && allowDuet.checked,

          allow_stitch:
            !allowStitch.disabled && allowStitch.checked,

          brand_organic_toggle:
            commercialToggle.checked && yourBrand.checked,

          brand_content_toggle:
            commercialToggle.checked && brandedContent.checked,

          is_aigc: isAigc.checked
        })
      });

      const initData = await parseResponse(initResponse);

      if (!initResponse.ok || initData.error) {
        throw new Error(
          initData.error ||
          "TikTok a refusé l'initialisation."
        );
      }

      if (!initData.upload_url || !initData.publish_id) {
        throw new Error(
          "TikTok n'a pas retourné l'URL d'envoi de la vidéo."
        );
      }

      setStatus("⏳ Envoi de la vidéo vers TikTok...", "");

      const lowerName = file.name.toLowerCase();

      let contentType = file.type;

      if (!contentType) {
        contentType = lowerName.endsWith(".mov")
          ? "video/quicktime"
          : "video/mp4";
      }

      const uploadResponse = await fetch(initData.upload_url, {
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
      });

      if (!uploadResponse.ok) {
        const uploadText = await uploadResponse.text();

        throw new Error(
          "L'envoi de la vidéo vers TikTok a échoué. " +
          uploadText
        );
      }

      setStatus(
        "⏳ Vidéo envoyée. TikTok traite maintenant la publication...",
        ""
      );

      let finished = false;

      for (let i = 0; i < 30; i++) {
        await new Promise((resolve) =>
          setTimeout(resolve, 4000)
        );

        const statusResponse = await fetch("/api/publish", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            action: "status",
            publish_id: initData.publish_id
          })
        });

        const statusData = await parseResponse(statusResponse);

        if (!statusResponse.ok || statusData.error) {
          throw new Error(
            statusData.error ||
            "Impossible de vérifier le statut TikTok."
          );
        }

        const publishStatus = statusData.status;

        if (
          publishStatus === "PUBLISH_COMPLETE" ||
          publishStatus === "SEND_TO_USER_INBOX"
        ) {
          setStatus(
            "✅ PUBLICATION TIKTOK RÉUSSIE !\\nLa vidéo peut prendre quelques minutes avant d'apparaître sur ton profil.",
            "success"
          );

          finished = true;
          break;
        }

        if (publishStatus === "FAILED") {
          throw new Error(
            statusData.fail_reason ||
            "TikTok indique que la publication a échoué."
          );
        }

        setStatus(
          "⏳ TikTok traite la vidéo... (" +
            publishStatus +
            ")",
          ""
        );
      }

      if (!finished) {
        setStatus(
          "⏳ La vidéo a bien été envoyée à TikTok. Le traitement continue. Vérifie ton profil dans quelques minutes.",
          "success"
        );
      }
    } catch (error) {
      setStatus("❌ " + error.message, "error");
    } finally {
      publishButton.disabled = false;
    }
  });
</script>

</body>
</html>`;
}

export default async function handler(req, res) {
  try {
    const session = getSession(req);

    if (req.method === "GET") {
      const creator = await getCreatorInfo(
        session.access_token
      );

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(renderPage(creator));
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", ["GET", "POST"]);
      return res.status(405).json({
        error: "Méthode non autorisée."
      });
    }

    const body = req.body || {};

    if (body.action === "init") {
      const creator = await getCreatorInfo(
        session.access_token
      );

      const videoSize = Number(body.video_size);
      const privacyLevel = String(
        body.privacy_level || ""
      );

      const title = String(body.title || "").slice(0, 2200);

      const privacyOptions =
        creator.privacy_level_options || [];

      if (!Number.isFinite(videoSize) || videoSize <= 0) {
        return res.status(400).json({
          error: "Taille de vidéo invalide."
        });
      }

      if (
        !privacyLevel ||
        !privacyOptions.includes(privacyLevel)
      ) {
        return res.status(400).json({
          error:
            "Choisis une confidentialité autorisée par TikTok."
        });
      }

      /*
        Sandbox / client non audité :
        TikTok n'autorise que SELF_ONLY.
      */
      if (privacyLevel !== "SELF_ONLY") {
        return res.status(400).json({
          error:
            "Cette application TikTok n'est pas encore auditée. Pour le test, sélectionne SELF_ONLY."
        });
      }

      const allowComment =
        body.allow_comment === true &&
        creator.comment_disabled !== true;

      const allowDuet =
        body.allow_duet === true &&
        creator.duet_disabled !== true;

      const allowStitch =
        body.allow_stitch === true &&
        creator.stitch_disabled !== true;

      const brandOrganic =
        body.brand_organic_toggle === true;

      const brandContent =
        body.brand_content_toggle === true;

      if (
        brandContent &&
        privacyLevel === "SELF_ONLY"
      ) {
        return res.status(400).json({
          error:
            "TikTok n'autorise pas le contenu de marque en visibilité SELF_ONLY."
        });
      }

      const payload = {
        post_info: {
          title: title,
          privacy_level: privacyLevel,

          disable_comment: !allowComment,
          disable_duet: !allowDuet,
          disable_stitch: !allowStitch,

          /*
            Ces deux champs sont importants :
            TikTok les prévoit dans Direct Post même
            lorsqu'ils valent false.
          */
          brand_content_toggle: brandContent,
          brand_organic_toggle: brandOrganic,

          is_aigc: body.is_aigc === true
        },

        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: videoSize,
          total_chunk_count: 1
        }
      };

      const tiktokResponse = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/video/init/",
        {
          method: "POST",
          headers: {
            Authorization:
              "Bearer " + session.access_token,
            "Content-Type":
              "application/json; charset=UTF-8"
          },
          body: JSON.stringify(payload)
        }
      );

      const tiktokJson = await tiktokResponse.json();

      if (
        !tiktokResponse.ok ||
        !tiktokJson.error ||
        tiktokJson.error.code !== "ok"
      ) {
        return res.status(400).json({
          error:
            tiktokJson?.error?.message ||
            tiktokJson?.error?.code ||
            "TikTok a refusé la publication.",

          code:
            tiktokJson?.error?.code || null,

          log_id:
            tiktokJson?.error?.log_id || null
        });
      }

      return res.status(200).json({
        publish_id: tiktokJson.data.publish_id,
        upload_url: tiktokJson.data.upload_url
      });
    }

    if (body.action === "status") {
      if (!body.publish_id) {
        return res.status(400).json({
          error: "publish_id manquant."
        });
      }

      const tiktokResponse = await fetch(
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

      const tiktokJson = await tiktokResponse.json();

      if (
        !tiktokResponse.ok ||
        !tiktokJson.error ||
        tiktokJson.error.code !== "ok"
      ) {
        return res.status(400).json({
          error:
            tiktokJson?.error?.message ||
            tiktokJson?.error?.code ||
            "Impossible de récupérer le statut TikTok."
        });
      }

      return res.status(200).json({
        status:
          tiktokJson?.data?.status || "PROCESSING",

        fail_reason:
          tiktokJson?.data?.fail_reason || null,

        publicaly_available_post_id:
          tiktokJson?.data?.publicaly_available_post_id || []
      });
    }

    return res.status(400).json({
      error: "Action inconnue."
    });
  } catch (error) {
    console.error("Publish API error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Erreur inconnue.";

    const status =
      message.includes("Session") ||
      message.includes("token")
        ? 401
        : 500;

    return res.status(status).json({
      error: message
    });
  }
}
