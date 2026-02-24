import { Router } from "express";
import crypto from "crypto"; // FIX: заменил Math.random() на crypto для генерации uniqueId
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma.js";
import { authenticateToken, type AuthRequest } from "../middleware/auth.js";
import {
  isStrongPassword,
  PASSWORD_POLICY_MESSAGE,
} from "../utils/validation.js";

const router = Router();

// FIX: Было "#" + Math.floor(1000 + Math.random() * 9000) → всего 9000 вариантов.
// При ~1000 пользователях вероятность коллизии около 5% (задача о днях рождения).
// Теперь 8-символьный hex (4 байта) = 4 294 967 296 вариантов + crypto вместо Math.random().
function generateUniqueId() {
  return "#" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Авторизация и регистрация пользователей
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Регистрация нового пользователя
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - username
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: Aa1!secure
 *                 description: Must be at least 8 characters and include uppercase, lowercase, number, and special character
 *               username:
 *                 type: string
 *                 example: John
 *           example:
 *             email: "user@example.com"
 *             password: "Aa1!secure"
 *             username: "John"
 *     responses:
 *       200:
 *         description: Успешная регистрация
 *       400:
 *         description: Неверные данные запроса
 *       409:
 *         description: Email уже используется
 *       415:
 *         description: Неверный Content-Type (нужен application/json)
 */
// FIX: убраны console.log, которые логировали req.body целиком (включая пароль в открытом виде),
// а также content-type, типы полей и сгенерированный uniqueId.
// В production это записывалось в stdout/логи, что является утечкой секретов.
router.post("/register", async (req, res) => {
  const ct = String(req.headers["content-type"] || "");
  try {
    if (!ct.includes("application/json")) {
      return res
        .status(415)
        .json({ error: "Content-Type must be application/json" });
    }

    const { email, password, username } = req.body ?? {};
    // Soft type coercion: numbers → strings, arrays/objects are not allowed
    const emailVal =
      typeof email === "string"
        ? email
        : typeof email === "number"
        ? String(email)
        : email;
    const passwordVal =
      typeof password === "string"
        ? password
        : typeof password === "number"
        ? String(password)
        : password;
    const usernameVal =
      typeof username === "string"
        ? username
        : typeof username === "number"
        ? String(username)
        : username;

    if (
      typeof emailVal !== "string" ||
      typeof passwordVal !== "string" ||
      typeof usernameVal !== "string"
    ) {
      return res.status(400).json({
        error:
          "Invalid field types: expected strings for email, password, username",
      });
    }

    const cleanEmail = emailVal.trim().toLowerCase();
    const cleanUsername = usernameVal.trim();
    const cleanPassword = passwordVal;

    if (!cleanEmail || !cleanPassword || !cleanUsername) {
      return res
        .status(400)
        .json({ error: "Please provide email, password, and username" });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: "Invalid email format" });
    }
    if (!isStrongPassword(cleanPassword)) {
      return res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });
    if (existingUser) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(cleanPassword, 10);

    // FIX: Раньше uniqueId генерировался отдельно, потом findUnique проверка,
    // потом create. Между check и insert был race condition (TOCTOU):
    // два параллельных запроса могли пройти проверку одновременно.
    // P2002 на email обрабатывался, но P2002 на uniqueId — нет (возвращало "Email already in use").
    // Теперь: atomic create в цикле, P2002.meta.target различает email и uniqueId коллизии.
    let user;
    for (let attempt = 0; attempt < 10; attempt++) {
      const uniqueId = generateUniqueId();
      try {
        user = await prisma.user.create({
          data: {
            email: cleanEmail,
            password: hashedPassword,
            username: cleanUsername,
            uniqueId,
          },
        });
        break;
      } catch (e: any) {
        if (e?.code === "P2002") {
          const target: string[] = e.meta?.target ?? [];
          if (target.includes("email")) {
            return res.status(409).json({ error: "Email already in use" });
          }
          // uniqueId collision — retry with a new one
          if (attempt === 9) {
            return res.status(500).json({ error: "Failed to generate unique ID" });
          }
          continue;
        }
        throw e;
      }
    }
    if (!user) {
      return res.status(500).json({ error: "Failed to generate unique ID" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        uniqueId: user.uniqueId,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Авторизация пользователя
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: 123456
 *           example:
 *             email: "user@example.com"
 *             password: "123456"
 *     responses:
 *       200:
 *         description: Успешный вход
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     email:
 *                       type: string
 *                     username:
 *                       type: string
 *                     uniqueId:
 *                       type: string
 *                     avatarUrl:
 *                       type: string
 *                       nullable: true
 *             example:
 *               token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *               user:
 *                 id: 1
 *                 email: user@example.com
 *                 username: John
 *                 uniqueId: "#1234"
 *                 avatarUrl: https://static.splitter.qzz.io/avatars/1/v1696070000/avatar.webp
 *       400:
 *         description: Неверные учетные данные
 *       415:
 *         description: Неверный Content-Type (нужен application/json)
 */
// FIX: убран console.log("/auth/login body:", req.body) — логировал пароль в открытом виде.
router.post("/login", async (req, res) => {
  try {
    const ct = String(req.headers["content-type"] || "");
    if (!ct.includes("application/json")) {
      return res
        .status(415)
        .json({ error: "Content-Type must be application/json" });
    }

    const { email, password } = req.body ?? {};

    const emailVal =
      typeof email === "string"
        ? email
        : typeof email === "number"
        ? String(email)
        : email;
    const passwordVal =
      typeof password === "string"
        ? password
        : typeof password === "number"
        ? String(password)
        : password;

    if (typeof emailVal !== "string" || typeof passwordVal !== "string") {
      return res.status(400).json({ error: "Invalid field types" });
    }

    const cleanEmail = emailVal.trim().toLowerCase();
    const cleanPassword = passwordVal;
    if (!cleanEmail || !cleanPassword) {
      return res.status(400).json({ error: "Please fill all fields" });
    }

    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const isValid = await bcrypt.compare(cleanPassword, user.password);
    if (!isValid) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        uniqueId: user.uniqueId,
        avatarUrl: user.avatarUrl ?? null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Получение информации о текущем пользователе
 *     description: Возвращает профиль пользователя по ID из JWT токена.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Информация о пользователе
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 email:
 *                   type: string
 *                   example: user@example.com
 *                 username:
 *                   type: string
 *                   example: John
 *                 uniqueId:
 *                   type: string
 *                   example: #1234
 *                 avatarUrl:
 *                   type: string
 *                   example: https://cdn.example.com/avatars/u1.png
 *       401:
 *         description: Требуется авторизация или неверный токен
 *       404:
 *         description: Пользователь не найден
 */
router.get("/me", authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        uniqueId: true,
        avatarUrl: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(user);
  } catch (err) {
    console.error("/auth/me error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
