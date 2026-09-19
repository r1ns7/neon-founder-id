import cors from "cors";
import express from "express";
import { existsSync, readFileSync } from "fs";
import fs from "fs/promises";
import multer from "multer";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 8787;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
const app = express();
const outputDir = path.join(__dirname, "public", "results");
const templateDir = path.join(__dirname, "public", "templates");

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

const aiImageProvider = (process.env.AI_IMAGE_PROVIDER?.trim() || "kimi").toLowerCase();
const genericAiApiKey = process.env.AI_API_KEY?.trim();
const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
const openAiImageModel = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
const kimiApiKey =
  process.env.MOONSHOT_API_KEY?.trim() ||
  process.env.KIMI_API_KEY?.trim() ||
  (aiImageProvider === "kimi" ? genericAiApiKey || openAiApiKey : "");
const configuredKimiBaseUrl = process.env.KIMI_BASE_URL?.trim();
const kimiBaseUrls = configuredKimiBaseUrl
  ? [configuredKimiBaseUrl.replace(/\/$/, "")]
  : ["https://api.moonshot.ai/v1", "https://api.moonshot.cn/v1"];
const kimiVisionModel = process.env.KIMI_VISION_MODEL?.trim() || "kimi-k2.6";

const templateConfigs = {
  architect: {
    file: "architect.png",
    head: { x: 1790, y: 1250, width: 980, height: 1450 },
  },
  innovator: {
    file: "innovator.png",
    head: { x: 1710, y: 1030, width: 1070, height: 1510 },
  },
  owner: {
    file: "owner.png",
    head: { x: 1795, y: 1240, width: 960, height: 1420 },
  },
  hybrid: {
    file: "hybrid.jpg",
    head: { x: 1790, y: 1240, width: 1000, height: 1470 },
  },
};

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(templateDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use("/results", express.static(outputDir));
app.use("/templates", express.static(templateDir));

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampText(value, allowed, fallback) {
  const text = String(value || "").trim();
  return allowed.includes(text) ? text : fallback;
}

function parseKimiJson(content) {
  if (!content) return {};
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]);
  } catch {
    return {};
  }
}

async function getKimiFaceGuidance(photoBuffer, profile) {
  if (!kimiApiKey) return null;

  const config = templateConfigs[profile] ?? templateConfigs.hybrid;
  const templatePath = path.join(templateDir, config.file);
  const portrait = await sharp(photoBuffer)
    .rotate()
    .resize(768, 768, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  const template = await sharp(templatePath)
    .resize(768, 768, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  const prompt = [
    "You are preparing a kiosk portrait for insertion into a finished student poster template.",
    "Analyze the student portrait and the template. The desired final style is a glossy printed career postcard:",
    "the photographed face should look naturally rebuilt into the illustrated student body, like a real person in the scene.",
    "Do not generate or edit an image.",
    "Return compact JSON only with these fields:",
    "cropFocus: one of top, center, slightly_left, slightly_right;",
    "offsetX: number from -0.08 to 0.08, negative moves the face left;",
    "offsetY: number from -0.10 to 0.08, negative moves the face up;",
    "zoom: number from 0.98 to 1.16;",
    "brightness: number from 0.94 to 1.10;",
    "saturation: number from 0.95 to 1.12;",
    "contrast: number from 0.96 to 1.14;",
    "warmth: number from -8 to 8.",
    "Prefer natural identity preservation, centered eyes, clean hairline, visible neck transition, and lighting close to the template.",
  ].join(" ");

  let payload;
  let lastError;
  for (const baseUrl of kimiBaseUrls) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${kimiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: kimiVisionModel,
          messages: [
            {
              role: "system",
              content: "You are Kimi, a visual analysis assistant. Return valid JSON only.",
            },
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${portrait.toString("base64")}` },
                },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${template.toString("base64")}` },
                },
                { type: "text", text: prompt },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const details = await response.text();
        lastError = new Error(`Kimi vision failed (${response.status}): ${details.slice(0, 500)}`);
        continue;
      }

      payload = await response.json();
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!payload) throw lastError || new Error("Kimi vision request failed");
  const guidance = parseKimiJson(payload?.choices?.[0]?.message?.content);
  return {
    cropFocus: clampText(guidance.cropFocus, ["top", "center", "slightly_left", "slightly_right"], "top"),
    offsetX: clampNumber(guidance.offsetX, -0.08, 0.08, 0),
    offsetY: clampNumber(guidance.offsetY, -0.1, 0.08, -0.02),
    zoom: clampNumber(guidance.zoom, 0.98, 1.16, 1.04),
    brightness: clampNumber(guidance.brightness, 0.94, 1.1, 0.99),
    saturation: clampNumber(guidance.saturation, 0.95, 1.12, 1.05),
    contrast: clampNumber(guidance.contrast, 0.96, 1.14, 1.03),
    warmth: clampNumber(guidance.warmth, -8, 8, 2),
  };
}

async function createStudentPoster(photoBuffer, profile, guidance = null) {
  const config = templateConfigs[profile] ?? templateConfigs.hybrid;
  const templatePath = path.join(templateDir, config.file);
  const templateMetadata = await sharp(templatePath).metadata();
  const width = templateMetadata.width;
  const height = templateMetadata.height;
  if (!width || !height) throw new Error("Template dimensions are unavailable");

  const { x, y, width: headWidth, height: headHeight } = config.head;
  const zoom = guidance?.zoom ?? 1.04;
  const layerWidth = Math.round(headWidth * zoom);
  const layerHeight = Math.round(headHeight * (zoom + 0.12));
  const positionMap = {
    top: "top",
    center: "center",
    slightly_left: "left",
    slightly_right: "right",
  };
  const position = positionMap[guidance?.cropFocus] || "top";
  const face = await sharp(photoBuffer)
    .resize(layerWidth, layerHeight, { fit: "cover", position })
    .modulate({
      saturation: guidance?.saturation ?? 1.05,
      brightness: guidance?.brightness ?? 0.99,
      hue: guidance?.warmth ?? 2,
    })
    .linear(guidance?.contrast ?? 1.03, 0)
    .sharpen({ sigma: 0.7, m1: 0.7, m2: 1.2 })
    .png()
    .toBuffer();
  const faceMask = Buffer.from(`
    <svg width="${layerWidth}" height="${layerHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="soft"><feGaussianBlur stdDeviation="14"/></filter>
      </defs>
      <g fill="white" filter="url(#soft)">
        <ellipse cx="${layerWidth / 2}" cy="${layerHeight * 0.37}" rx="${layerWidth * 0.38}" ry="${layerHeight * 0.34}"/>
        <path d="
          M ${layerWidth * 0.28} ${layerHeight * 0.52}
          C ${layerWidth * 0.34} ${layerHeight * 0.72}, ${layerWidth * 0.66} ${layerHeight * 0.72}, ${layerWidth * 0.72} ${layerHeight * 0.52}
          L ${layerWidth * 0.86} ${layerHeight * 0.98}
          L ${layerWidth * 0.14} ${layerHeight * 0.98}
          Z
        "/>
      </g>
    </svg>
  `);
  const maskedFace = await sharp(face)
    .composite([{ input: faceMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  const left = Math.round(x - (layerWidth - headWidth) / 2 + headWidth * (guidance?.offsetX ?? 0));
  const top = Math.round(y - headHeight * 0.13 + headHeight * (guidance?.offsetY ?? -0.02));
  const localLight = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="skinBlend" cx="38%" cy="18%" r="68%">
          <stop offset="0" stop-color="#fff2df" stop-opacity="0.22"/>
          <stop offset="0.46" stop-color="#c78bff" stop-opacity="0.08"/>
          <stop offset="1" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect x="${left - 80}" y="${top - 70}" width="${layerWidth + 160}" height="${layerHeight + 120}" fill="url(#skinBlend)"/>
    </svg>
  `);

  return sharp(templatePath)
    .composite([
      {
        input: maskedFace,
        left,
        top,
      },
      {
        input: localLight,
        blend: "soft-light",
      },
    ])
    .png()
    .toBuffer();
}

async function createKimiStudentPoster(photoBuffer, profile) {
  const guidance = await getKimiFaceGuidance(photoBuffer, profile);
  if (!guidance) {
    throw new Error("Kimi API key is not configured");
  }
  return createStudentPoster(photoBuffer, profile, guidance);
}

async function createAiStudentPoster(photoBuffer, profile) {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const config = templateConfigs[profile] ?? templateConfigs.hybrid;
  const templatePath = path.join(templateDir, config.file);
  const originalMetadata = await sharp(templatePath).metadata();
  const originalWidth = originalMetadata.width;
  const originalHeight = originalMetadata.height;
  if (!originalWidth || !originalHeight) throw new Error("Template dimensions are unavailable");

  const scale = Math.min(1, 1536 / originalWidth, 1536 / originalHeight);
  const aiWidth = Math.max(1, Math.round(originalWidth * scale));
  const aiHeight = Math.max(1, Math.round(originalHeight * scale));
  const aiHead = {
    x: Math.round(config.head.x * scale),
    y: Math.round(config.head.y * scale),
    width: Math.round(config.head.width * scale),
    height: Math.round(config.head.height * scale),
  };

  const templateBuffer = await sharp(templatePath).resize(aiWidth, aiHeight).png().toBuffer();
  const photoForAi = await sharp(photoBuffer).rotate().resize(1200, 1200, {
    fit: "inside",
    withoutEnlargement: true,
  }).jpeg({ quality: 92 }).toBuffer();
  const maskSvg = Buffer.from(`
    <svg width="${aiWidth}" height="${aiHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white"/>
      <ellipse
        cx="${aiHead.x + aiHead.width / 2}"
        cy="${aiHead.y + aiHead.height / 2}"
        rx="${aiHead.width * 0.49}"
        ry="${aiHead.height * 0.5}"
        fill="black"
        fill-opacity="0"
      />
    </svg>
  `);
  const mask = await sharp(maskSvg).png().toBuffer();

  const prompt = [
    "Create a polished glossy career-postcard result like a professional printed profession poster.",
    "Use the supplied student portrait as the identity source and the supplied poster template as the locked composition.",
    "Replace only the empty black head/face placeholder inside the mask with the student's realistic face, hair, ears, neck, and natural upper-neck transition.",
    "The inserted person must look naturally photographed into the scene, not pasted on top.",
    "Preserve identity, face proportions, skin tone, hairstyle direction, glasses if present, age, and expression.",
    "Match the head angle, eye line, scale, perspective, studio lighting, color temperature, contrast, sharpness, and shadows to the illustrated body.",
    "Blend hair edges, jawline, neck, and collar area cleanly. Remove any black placeholder silhouette completely.",
    "Do not change the template composition, clothing, hands, props, background, logo, QR code, typography, or any existing text.",
    "Do not add extra people, accessories, text, watermarks, or decorative elements.",
    "Return a polished finished poster in the same composition.",
  ].join(" ");

  const form = new FormData();
  form.append("model", openAiImageModel);
  form.append("image[]", new Blob([templateBuffer], { type: "image/png" }), "template.png");
  form.append("image[]", new Blob([photoForAi], { type: "image/jpeg" }), "student.jpg");
  form.append("mask", new Blob([mask], { type: "image/png" }), "mask.png");
  form.append("prompt", prompt);
  form.append("size", "auto");
  form.append("quality", process.env.OPENAI_IMAGE_QUALITY?.trim() || "high");
  form.append("output_format", "png");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiApiKey}` },
    body: form,
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI image edit failed (${response.status}): ${details.slice(0, 500)}`);
  }

  const payload = await response.json();
  const item = payload?.data?.[0];
  if (!item) throw new Error("OpenAI returned no image");

  let resultBuffer;
  if (item.b64_json) {
    resultBuffer = Buffer.from(item.b64_json, "base64");
  } else if (item.url) {
    const imageResponse = await fetch(item.url);
    if (!imageResponse.ok) throw new Error("Could not download the generated image");
    resultBuffer = Buffer.from(await imageResponse.arrayBuffer());
  } else {
    throw new Error("OpenAI returned an unsupported image response");
  }

  return sharp(resultBuffer).resize(originalWidth, originalHeight).png().toBuffer();
}

app.post("/api/process-photo", upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).send("Photo is required");

  try {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let result;
    let aiUsed = false;
    let aiProvider = "sharp";
    if (kimiApiKey) {
      try {
        result = await createKimiStudentPoster(req.file.buffer, req.body.profile || "hybrid");
        aiUsed = true;
        aiProvider = "kimi";
      } catch (error) {
        console.warn("Kimi processing failed; trying next processor:", error);
      }
    }
    if (!result && aiImageProvider === "openai" && openAiApiKey) {
      try {
        result = await createAiStudentPoster(req.file.buffer, req.body.profile || "hybrid");
        aiUsed = true;
        aiProvider = "openai";
      } catch (error) {
        console.warn("AI processing failed; using deterministic compositor:", error);
      }
    }
    result ??= await createStudentPoster(req.file.buffer, req.body.profile || "hybrid");
    const filename = `${id}.png`;
    await fs.writeFile(path.join(outputDir, filename), result);
    res.json({ resultUrl: `/results/${filename}`, aiUsed, aiProvider });
  } catch (error) {
    console.error(error);
    res.status(500).send("Image processing failed");
  }
});

app.listen(port, () => {
  console.log(`Photo processor listening on http://localhost:${port}`);
});
