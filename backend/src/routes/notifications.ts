import { Router, type Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, type AuthRequest } from "../middleware/auth.js";

const prisma = new PrismaClient();
const router = Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: In-app notification management
 */

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: List notifications for the current user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Max number of notifications (default 50)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: Array of notifications
 */
router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    return res.json(notifications);
  } catch (err) {
    console.error("GET /notifications error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: Get unread notification count
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count
 */
router.get(
  "/unread-count",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const count = await prisma.notification.count({
        where: { userId: req.user.id, read: false },
      });

      return res.json({ count });
    } catch (err) {
      console.error("GET /notifications/unread-count error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

/**
 * @swagger
 * /notifications/read:
 *   post:
 *     summary: Mark notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of notification IDs to mark as read (omit to mark all)
 *     responses:
 *       200:
 *         description: Number of updated notifications
 */
router.post(
  "/read",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const ids: number[] | undefined = req.body?.ids;
      const where: any = { userId: req.user.id, read: false };

      if (Array.isArray(ids) && ids.length > 0) {
        where.id = { in: ids.map(Number).filter(Number.isFinite) };
      }

      const result = await prisma.notification.updateMany({
        where,
        data: { read: true },
      });

      return res.json({ updated: result.count });
    } catch (err) {
      console.error("POST /notifications/read error:", err);
      return res.status(500).json({ error: "Server error" });
    }
  }
);

export default router;

export async function createNotification(
  userId: number,
  type: string,
  title: string,
  body: string,
  meta?: Record<string, unknown>
) {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type: type as any,
        title,
        body,
        ...(meta ? { meta: meta as any } : {}),
      },
    });
  } catch (err) {
    console.error("createNotification error:", err);
  }
}
