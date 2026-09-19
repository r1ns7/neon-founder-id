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

const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
const openAiImageModel = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";

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

async function createStudentPoster(photoBuffer, profile) {
  const config = templateConfigs[profile] ?? templateConfigs.hybrid;
  const templatePath = path.join(templateDir, config.file);
  const templateMetadata = await sharp(templatePath).metadata();
  const width = templateMetadata.width;
  const height = templateMetadata.height;
  if (!width || !height) throw new Error("Template dimensions are unavailable");

  const { x, y, width: headWidth, height: headHeight } = config.head;
  const layerWidth = Math.round(headWidth * 1.06);
  const layerHeight = Math.round(headHeight * 1.16);
  const face = await sharp(photoBuffer)
    .resize(layerWidth, layerHeight, { fit: "cover", position: "top" })
    .modulate({ saturation: 1.05, brightness: 0.97 })
    .png()
    .toBuffer();
  const faceMask = Buffer.from(`
    <svg width="${layerWidth}" height="${layerHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="soft"><feGaussianBlur stdDeviation="18"/></filter></defs>
      <ellipse cx="${layerWidth / 2}" cy="${layerHeight / 2}" rx="${layerWidth * 0.49}" ry="${layerHeight * 0.5}" fill="white" filter="url(#soft)"/>
    </svg>
  `);
  const maskedFace = await sharp(face)
    .composite([{ input: faceMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  return sharp(templatePath)
    .composite([
      {
        input: maskedFace,
        left: Math.round(x - headWidth * 0.03),
        top: Math.round(y - headHeight * 0.08),
      },
    ])
    .png()
    .toBuffer();
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
    "Edit the supplied poster template using the supplied student portrait.",
    "Replace only the face/head area inside the transparent oval mask with the real person's face.",
    "Preserve the person's identity, facial features, skin tone, age, hairline, and natural expression.",
    "Match the head angle, scale, perspective, lighting, color grading, sharpness, and shadows to the illustrated body.",
    "Make the transition around the neck and hairline clean and natural.",
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
    if (openAiApiKey) {
      try {
        result = await createAiStudentPoster(req.file.buffer, req.body.profile || "hybrid");
        aiUsed = true;
      } catch (error) {
        console.warn("AI processing failed; using deterministic compositor:", error);
      }
    }
    result ??= await createStudentPoster(req.file.buffer, req.body.profile || "hybrid");
    const filename = `${id}.png`;
    await fs.writeFile(path.join(outputDir, filename), result);
    res.json({ resultUrl: `/results/${filename}`, aiUsed });
  } catch (error) {
    console.error(error);
    res.status(500).send("Image processing failed");
  }
});

app.listen(port, () => {
  console.log(`Photo processor listening on http://localhost:${port}`);
});
