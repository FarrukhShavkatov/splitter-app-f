import type { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const status =
    (typeof err === "object" && err && (err as any).statusCode) ||
    (typeof err === "object" && err && (err as any).status) ||
    500;

  const rawMessage =
    typeof err === "object" && err && (err as any).message
      ? String((err as any).message)
      : "Internal Server Error";

  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error("Unhandled error:", err);
  }

  // FIX: раньше rawMessage (внутреннее сообщение ошибки, включая SQL-запросы, пути файлов,
  // стек Prisma и т.д.) отправлялся клиенту as-is при статусе 500.
  // Теперь в production все 5xx ошибки маскируются стандартным сообщением.
  const message =
    status >= 500 && process.env.NODE_ENV === "production"
      ? "Internal Server Error"
      : rawMessage;

  return res.status(Number(status)).json({
    success: false,
    error: message,
    code: Number(status),
  });
}
