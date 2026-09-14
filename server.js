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
const templateDir = path.join(__dirname, "templates");

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(templateDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use("/results", express.static(outputDir));
app.use("/templates", express.static(templateDir));

async function createDemoPoster(photoBuffer, profile) {
  const width = 1080;
  const height = 1350;
  const face = await sharp(photoBuffer)
    .resize(700, 850, { fit: "cover", position: "centre" })
    .modulate({ saturation: 1.08, brightness: 1.04 })
    .png()
    .toBuffer();

  const accent = profile === "innovator" ? "#25f4ff" : profile === "owner" ? "#ffb52e" : "#ff32df";
  const title =
    profile === "architect"
      ? "STRATEG\nARCHITECT"
      : profile === "innovator"
        ? "INNOVATOR\nCONNECTOR"
        : profile === "owner"
          ? "PRACTICAL\nOWNER"
          : "HYBRID\nPROFILE";

  const frame = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#090313"/>
          <stop offset="0.52" stop-color="#4c0c72"/>
          <stop offset="1" stop-color="#0c1d46"/>
        </linearGradient>
        <linearGradient id="glow" x1="0" x2="1">
          <stop stop-color="${accent}"/>
          <stop offset="1" stop-color="#25f4ff"/>
        </linearGradient>
        <filter id="blur"><feGaussianBlur stdDeviation="30"/></filter>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <circle cx="140" cy="170" r="190" fill="${accent}" opacity="0.45" filter="url(#blur)"/>
      <circle cx="940" cy="1120" r="260" fill="#25f4ff" opacity="0.22" filter="url(#blur)"/>
      <path d="M0 1020 L1080 460" stroke="${accent}" stroke-width="3" opacity="0.8"/>
      <path d="M0 1070 L1080 510" stroke="#25f4ff" stroke-width="1" opacity="0.5"/>
      <rect x="48" y="48" width="984" height="1254" rx="24" fill="none" stroke="white" stroke-opacity="0.3"/>
      <text x="72" y="120" fill="#25f4ff" font-family="Arial" font-size="23" font-weight="700" letter-spacing="4">NEON FOUNDER ID / AI PORTRAIT</text>
      <text x="72" y="1120" fill="white" font-family="Arial" font-size="82" font-weight="900">${title.split("\n")[0]}</text>
      <text x="72" y="1200" fill="white" font-family="Arial" font-size="82" font-weight="900">${title.split("\n")[1]}</text>
      <text x="76" y="1250" fill="${accent}" font-family="Arial" font-size="22" font-weight="700" letter-spacing="3">YOUR NEXT MOVE STARTS HERE</text>
    </svg>`;

  return sharp({
    create: { width, height, channels: 4, background: "#090313" },
  })
    .composite([
      { input: Buffer.from(frame), blend: "over" },
      { input: face, top: 190, left: 190, blend: "over" },
    ])
    .png()
    .toBuffer();
}

app.post("/api/process-photo", upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).send("Photo is required");

  try {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await createDemoPoster(req.file.buffer, req.body.profile || "hybrid");
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
