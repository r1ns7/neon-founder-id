import cors from "cors";
import express from "express";
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

app.post("/api/process-photo", upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).send("Photo is required");

  try {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await createStudentPoster(req.file.buffer, req.body.profile || "hybrid");
    const filename = `${id}.png`;
    await fs.writeFile(path.join(outputDir, filename), result);
    res.json({ resultUrl: `/results/${filename}` });
  } catch (error) {
    console.error(error);
    res.status(500).send("Image processing failed");
  }
});

app.listen(port, () => {
  console.log(`Photo processor listening on http://localhost:${port}`);
});
