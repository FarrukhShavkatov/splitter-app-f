import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isR2Configured, uploadAvatarObject } from "../config/r2.js";

export const LOCAL_MEDIA_ROUTE = "/media";

export function getLocalMediaRoot(): string {
  return path.resolve(process.env.LOCAL_UPLOAD_DIR || "uploads");
}

function localAvatarUrl(publicOrigin: string, key: string): string {
  const origin = publicOrigin.replace(/\/$/, "");
  const encodedKey = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${origin}${LOCAL_MEDIA_ROUTE}/${encodedKey}`;
}

export async function storeAvatarObject(
  key: string,
  body: Buffer,
  contentType: string,
  publicOrigin: string
): Promise<{ key: string; url: string }> {
  if (isR2Configured()) {
    return uploadAvatarObject(key, body, contentType);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Avatar storage is not configured");
  }

  const root = getLocalMediaRoot();
  const target = path.resolve(root, ...key.split("/"));
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid avatar storage key");
  }

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);

  return { key, url: localAvatarUrl(publicOrigin, key) };
}
