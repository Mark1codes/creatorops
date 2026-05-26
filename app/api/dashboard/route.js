import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const ROOT = process.cwd();

async function readText(fileName) {
  try {
    return await fs.readFile(path.join(ROOT, fileName), "utf8");
  } catch {
    return "";
  }
}

async function readJson(fileName, fallback = []) {
  const text = await readText(fileName);
  if (!text.trim()) return fallback;

  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function splitCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value);
  return values;
}

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 2) return [];

  const headers = splitCsvLine(rows[0]).map((header) => header.trim());
  return rows.slice(1).map((row) => {
    const values = splitCsvLine(row);
    return headers.reduce((record, header, index) => {
      record[header] = values[index] ? values[index].trim() : "";
      return record;
    }, {});
  });
}

function getEnvValue(envText, key) {
  const line = envText.split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : "";
}

function parseTargetChannels(envText) {
  return getEnvValue(envText, "TARGET_CHANNELS")
    .replace(/;/g, ",")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

function collectEmails(channels, uploadRows, dualRows) {
  const fromChannels = channels.flatMap((channel) => Array.isArray(channel.emails) ? channel.emails : []);
  const fromUpload = uploadRows.map((row) => row.email);
  const fromDual = dualRows.map((row) => row["Scraped Email"]);
  return [...new Set([...fromChannels, ...fromUpload, ...fromDual].filter(Boolean))].sort();
}

export async function GET() {
  const [
    envText,
    lastFrontendScrape,
    scrapeHistory,
    channels,
    bouncifyUploadCsv,
    bouncifyJobsCsv,
    dualValidationCsv,
    verifiedCsv,
    allChecksCsv
  ] = await Promise.all([
    readText(".env"),
    readJson("last_frontend_scrape.json", {}),
    readJson("scrape_history.json", []),
    readJson("apify_raw_results.json", []),
    readText("bouncify_upload.csv"),
    readText("bouncify_bulk_jobs.csv"),
    readText("dual_validation_results.csv"),
    readText("verified_youtube_creators.csv"),
    readText("all_bouncify_checks.csv")
  ]);

  const uploadRows = parseCsv(bouncifyUploadCsv);
  const jobs = parseCsv(bouncifyJobsCsv);
  const dualValidation = parseCsv(dualValidationCsv);
  const verified = parseCsv(verifiedCsv);
  const allChecks = parseCsv(allChecksCsv);
  const targetChannels = parseTargetChannels(envText);
  const latestSubmittedChannels = Array.isArray(lastFrontendScrape.urls) ? lastFrontendScrape.urls : [];
  const activeTargetChannels = latestSubmittedChannels.length ? latestSubmittedChannels : targetChannels;
  const emails = collectEmails(channels, uploadRows, dualValidation);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    config: {
      targetChannels,
      activeTargetChannels,
      latestSubmittedChannels,
      latestSubmittedAt: lastFrontendScrape.submittedAt || "",
      providers: getEnvValue(envText, "VALIDATION_PROVIDERS") || "bouncify",
      bouncifyMode: getEnvValue(envText, "BOUNCIFY_MODE") || "single",
      actorId: getEnvValue(envText, "APIFY_ACTOR_ID") || "not configured"
    },
    channels,
    emails,
    jobs,
    scrapeHistory: Array.isArray(scrapeHistory) ? scrapeHistory.map((entry) => ({
      id: entry.id,
      submittedAt: entry.submittedAt,
      submittedCount: entry.submittedCount,
      returnedCount: entry.returnedCount,
      emailCount: entry.emailCount,
      urls: entry.urls
    })) : [],
    dualValidation,
    verified,
    allChecks,
    files: {
      apifyRawResults: channels.length > 0,
      bouncifyUpload: uploadRows.length > 0,
      bouncifyJobs: jobs.length > 0,
      dualValidation: dualValidation.length > 0,
      verified: verified.length > 0,
      allChecks: allChecks.length > 0
    }
  });
}
