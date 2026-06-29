import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { authenticateToken } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { storeAvatarObject } from "../services/avatarStorage.js";

type UploadFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};
// We rely on multer to inject req.file at runtime; keep a minimal local typing for safety
type ReqFileMinimal = { buffer: Buffer; mimetype: string; size: number };

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Uploads
 *   description: File uploads (avatars)
 */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.AVATAR_MAX_BYTES || 2 * 1024 * 1024), // default 2MB
  },
});

type SupportedImage = {
  mime: "image/webp" | "image/jpeg" | "image/png" | "image/gif";
  ext: ".webp" | ".jpg" | ".png" | ".gif";
};

function detectImageType(buffer: Buffer): SupportedImage | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { mime: "image/jpeg", ext: ".jpg" };
  }
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mime: "image/png", ext: ".png" };
  }
  if (buffer.length >= 6) {
    const signature = buffer.subarray(0, 6).toString("ascii");
    if (signature === "GIF87a" || signature === "GIF89a") {
      return { mime: "image/gif", ext: ".gif" };
    }
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mime: "image/webp", ext: ".webp" };
  }
  return null;
}

function uploadSingleFile(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Avatar image is too large" });
      return;
    }
    if (error) {
      next(error);
      return;
    }
    next();
  });
}

function getPublicOrigin(req: Request): string {
  const configuredOrigin = (process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
  if (configuredOrigin) return configuredOrigin;
  return `${req.protocol}://${req.get("host")}`;
}

/**
 * @swagger
 * /uploads/avatar:
 *   post:
 *     summary: Upload user avatar (multipart/form-data)
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *           encoding:
 *             file:
 *               contentType: image/webp, image/jpeg, image/png, image/gif
 *       description: |
 *         Upload image using multipart/form-data with the field name `file`.
 *
 *         Example (cURL):
 *
 *           curl -X POST "https://api.example.com/uploads/avatar" \
 *             -H "Authorization: Bearer <TOKEN>" \
 *             -H "Content-Type: multipart/form-data" \
 *             -F "file=@/path/to/avatar.webp"
 *     responses:
 *       200:
 *         description: Avatar uploaded and saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 avatarUrl:
 *                   type: string
 *                   example: https://static.splitter.qzz.io/avatars/123/v1696070000/avatar.webp
 *                 key:
 *                   type: string
 *                   example: avatars/123/v1696070000/avatar.webp
 *       400:
 *         description: Bad request (e.g., missing file or unsupported type)
 *       401:
 *         description: Unauthorized
 *       413:
 *         description: Payload too large (exceeds AVATAR_MAX_BYTES)
 */
router.post(
  "/avatar",
  authenticateToken,
  uploadSingleFile,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const file = (req as any).file as ReqFileMinimal | undefined;
      if (!file) {
        res.status(400).json({ error: "file is required" });
        return;
      }

      const { buffer, size } = file;
      const maxBytes = Number(process.env.AVATAR_MAX_BYTES || 2 * 1024 * 1024);
      if (size > maxBytes) {
        res.status(413).json({ error: "File too large" });
        return;
      }

      const imageType = detectImageType(buffer);
      if (!imageType) {
        res.status(400).json({ error: "Unsupported or invalid image file" });
        return;
      }

      const key = `avatars/${req.user.id}/v${Date.now()}/avatar${imageType.ext}`;

      const put = await storeAvatarObject(
        key,
        buffer,
        imageType.mime,
        getPublicOrigin(req)
      );

      // Persist URL to user
      await prisma.user.update({
        where: { id: req.user.id },
        data: { avatarUrl: put.url },
        select: { id: true },
      });

      res.json({ success: true, avatarUrl: put.url, key: put.key });
      return;
    } catch (err) {
      console.error("POST /uploads/avatar error:", err);
      res.status(500).json({ error: "Server error" });
      return;
    }
  }
);

export default router;
