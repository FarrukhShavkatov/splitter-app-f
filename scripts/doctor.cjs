const { execSync } = require("child_process");

function run(label, command) {
  try {
    const output = execSync(command, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }).trim();
    console.log(`OK: ${label}${output ? `\n    ${output.split(/\r?\n/)[0]}` : ""}`);
    return true;
  } catch (error) {
    console.warn(`WARN: ${label} is not ready.`);
    const message = String(error.stderr || error.message || "").trim();
    if (message) console.warn(`      ${message.split(/\r?\n/)[0]}`);
    return false;
  }
}

console.log("Receipt Splitter doctor\n");

run("Node.js", "node -v");
run("npm", "npm -v");
run("Docker CLI", "docker --version");
run("Docker Compose", "docker compose version");

console.log("\nChecking project env files...");
require("./check-env.cjs");
