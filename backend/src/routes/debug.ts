import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

// FIX: debug-эндпоинты были доступны всем без авторизации, включая production.
// 1) Добавлен middleware, который в production возвращает 404 — эндпоинты полностью скрыты.
// 2) Добавлен authenticateToken — даже в dev-режиме нужен валидный JWT.
// Причина: /debug/gemini раскрывал наличие и формат GEMINI_API_KEY,
// а также позволял кому угодно делать запросы к Google AI за счёт сервера.
router.use((req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }
  next();
});

router.get("/gemini", authenticateToken, async (req: Request, res: Response) => {
  const key = process.env.GEMINI_API_KEY;
  const testModel = (
    process.env.GEMINI_MODEL_PARSE || "gemini-1.5-flash"
  ).trim();
  if (!key) {
    return res.json({
      keyPresent: false,
      message: "GEMINI_API_KEY not set in env",
    });
  }
  const keyFormatValid = /^AIza[0-9A-Za-z_-]{10,}$/.test(key);
  const url = `https://generativelanguage.googleapis.com/v1/models/${testModel}:generateContent?key=${encodeURIComponent(
    key
  )}`;
  let attempt: any = {};
  try {
    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: "Respond with a single word: ok" }],
        },
      ],
      generationConfig: { temperature: 0 },
    };
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    attempt.httpStatus = resp.status;
    attempt.ok = resp.ok;
    const text = await resp.text();
    try {
      attempt.body = JSON.parse(text);
    } catch {
      attempt.body = text.slice(0, 500);
    }
  } catch (e: any) {
    attempt.error = e?.message || String(e);
  }
  res.json({ keyPresent: true, keyFormatValid, testModel, attempt });
});

export default router;
