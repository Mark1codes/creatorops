import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const ROOT = process.cwd();
const EMAIL_PATTERN = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

async function readEnv() {
  try {
    return await fs.readFile(path.join(ROOT, ".env"), "utf8");
  } catch {
    return "";
  }
}

function getEnvValue(envText, key) {
  const line = envText.split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : "";
}

async function validateBouncify(email, apiKey) {
  if (!apiKey || apiKey.startsWith("YOUR_")) return "missing_key";

  const params = new URLSearchParams({
    apikey: apiKey,
    email,
    timeout: "30000"
  });
  const response = await fetch(`https://api.bouncify.io/v1/verify?${params}`, { cache: "no-store" });
  if (!response.ok) return "error";

  const result = await response.json();
  return result.result || result.status || "unknown";
}

async function validateZeroBounce(email, apiKey) {
  if (!apiKey || apiKey.startsWith("YOUR_")) return "missing_key";

  const params = new URLSearchParams({
    api_key: apiKey,
    email
  });
  const response = await fetch(`https://api.zerobounce.net/v2/validate?${params}`, { cache: "no-store" });
  if (!response.ok) return "error";

  const result = await response.json();
  return result.status || "unknown";
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim();

  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const envText = await readEnv();
  const bouncifyKey = getEnvValue(envText, "BOUNCIFY_KEY");
  const zeroBounceKey = getEnvValue(envText, "ZEROBOUNCE_API_KEY");

  const [bouncifyStatus, zeroBounceStatus] = await Promise.all([
    validateBouncify(email, bouncifyKey),
    validateZeroBounce(email, zeroBounceKey)
  ]);

  return NextResponse.json({
    email,
    bouncifyStatus,
    zeroBounceStatus
  });
}
