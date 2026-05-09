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

  // Do not leak internal details (SQL, file paths, Prisma messages) to clients
  // when the app runs in production.
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
