const SUPPORTED_NODE_MAJORS = new Set([18, 20]);

export type BackendEnv = {
  port: number;
  jsonBodyLimit: string;
  corsOrigins: string[];
  allowAllCors: boolean;
};

function requireString(name: string): string {
  const value = (process.env[name] || "").trim();
  if (!value) {
    throw new Error(`${name} is required. Check backend/.env or docker-compose.yml.`);
  }
  return value;
}

function readPort(): number {
  const raw = process.env.PORT || "8080";
  const port = Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`PORT must be a valid TCP port. Received: ${raw}`);
  }
  return port;
}

export function validateBackendEnv(): BackendEnv {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (!SUPPORTED_NODE_MAJORS.has(nodeMajor)) {
    console.warn(
      `WARN: Node.js ${process.version} is not the recommended version. Use Node.js 18 or 20 LTS for this project.`
    );
  }

  const databaseUrl = requireString("DATABASE_URL");
  if (!databaseUrl.startsWith("postgresql://")) {
    console.warn("WARN: DATABASE_URL should usually start with postgresql://");
  }

  const jwtSecret = requireString("JWT_SECRET");
  if (jwtSecret.length < 16) {
    throw new Error("JWT_SECRET must be at least 16 characters.");
  }

  const rawCorsOrigins = (process.env.CORS_ORIGINS || "").trim();
  const allowAllCors =
    rawCorsOrigins === "*" || process.env.ALLOW_ALL_CORS === "1";
  const corsOrigins = rawCorsOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port: readPort(),
    jsonBodyLimit: process.env.JSON_BODY_LIMIT || "4mb",
    corsOrigins,
    allowAllCors,
  };
}
