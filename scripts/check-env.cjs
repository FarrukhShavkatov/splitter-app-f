const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const backendEnv = path.join(root, "backend", ".env");
const frontendEnv = path.join(root, "frontend", ".env");
const frontendEnvExample = path.join(root, "frontend", ".env.example");
const backendEnvExample = path.join(root, "backend", ".env.example");

let hasErrors = false;

function markError(message) {
  hasErrors = true;
  console.error(`ERROR: ${message}`);
}

function warn(message) {
  console.warn(`WARN: ${message}`);
}

function ok(message) {
  console.log(`OK: ${message}`);
}

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const result = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    result[key] = value;
  }
  return result;
}

function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) {
    markError(`Node.js ${process.version} is too old. Install Node.js 18 or 20 LTS.`);
    return;
  }
  if (major > 20) {
    warn(`Node.js ${process.version} may be too new for Expo/React Native. Prefer Node.js 20 LTS.`);
    return;
  }
  ok(`Node.js ${process.version}`);
}

function checkEnvFiles() {
  if (!fs.existsSync(backendEnv)) {
    warn("backend/.env is missing. Docker can still run with safe defaults, but local backend dev needs it.");
    console.log(`      Copy: backend/.env.example -> backend/.env`);
  } else {
    ok("backend/.env exists");
  }

  if (!fs.existsSync(frontendEnv)) {
    warn("frontend/.env is missing. Expo will use a localhost default, which does not work from a real phone.");
    console.log(`      Copy: frontend/.env.example -> frontend/.env`);
  } else {
    ok("frontend/.env exists");
  }

  if (!fs.existsSync(backendEnvExample)) markError("backend/.env.example is missing.");
  if (!fs.existsSync(frontendEnvExample)) markError("frontend/.env.example is missing.");
}

function checkBackendEnv() {
  const env = readEnv(backendEnv);
  if (!fs.existsSync(backendEnv)) return;

  if (!env.JWT_SECRET || env.JWT_SECRET.length < 16) {
    markError("backend/.env JWT_SECRET must be at least 16 characters.");
  }

  if (!env.DATABASE_URL) {
    markError("backend/.env DATABASE_URL is missing.");
  } else if (!env.DATABASE_URL.startsWith("postgresql://")) {
    warn("backend/.env DATABASE_URL should usually start with postgresql://");
  }
}

function checkFrontendEnv() {
  const env = readEnv(frontendEnv);
  if (!fs.existsSync(frontendEnv)) return;

  const apiUrl = env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) {
    markError("frontend/.env EXPO_PUBLIC_API_URL is missing.");
    return;
  }

  try {
    const parsed = new URL(apiUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      markError("EXPO_PUBLIC_API_URL must start with http:// or https://");
    }
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      warn("EXPO_PUBLIC_API_URL uses localhost. This works in a browser, but not from Expo Go on a real phone.");
      console.log("      For a phone, use your computer LAN IP, for example: http://192.168.1.23:8080");
    }
  } catch {
    markError(`EXPO_PUBLIC_API_URL is not a valid URL: ${apiUrl}`);
  }
}

console.log("Receipt Splitter environment check\n");
checkNode();
checkEnvFiles();
checkBackendEnv();
checkFrontendEnv();

if (hasErrors) {
  console.error("\nEnvironment check failed. Fix the ERROR lines above, then run npm run check-env again.");
  process.exit(1);
}

console.log("\nEnvironment check finished. WARN lines are common during first setup; read the suggested action under each warning.");
