import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const CHANNEL_LIMIT = 75;
const LAST_FRONTEND_SCRAPE_FILE = path.join(process.cwd(), "last_frontend_scrape.json");
const SCRAPE_HISTORY_FILE = path.join(process.cwd(), "scrape_history.json");
const YOUTUBE_URL_PATTERN = /^https:\/\/(www\.)?youtube\.com\/(@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+|user\/[\w.-]+)(\/.*)?$/i;

function parseUrls(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .replace(/;/g, "\n")
    .replace(/,/g, "\n")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function runScraper(urls) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", ["youtube_scraper.py"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
        TARGET_CHANNELS_OVERRIDE: urls.join(",")
      },
      shell: false,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr || stdout || `Scraper exited with code ${code}`));
    });
  });
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readProjectFile(fileName) {
  try {
    return await fs.readFile(path.join(process.cwd(), fileName), "utf8");
  } catch {
    return "";
  }
}

function extractNumber(pattern, text) {
  const match = text.match(pattern);
  return match ? Number(match[1]) : 0;
}

async function appendScrapeHistory({ urls, stdout }) {
  const history = await readJsonFile(SCRAPE_HISTORY_FILE, []);
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const entry = {
    id,
    submittedAt: new Date().toISOString(),
    submittedCount: urls.length,
    returnedCount: extractNumber(/Apify channel records returned:\s*(\d+)/i, stdout),
    emailCount: extractNumber(/Unique valid emails found:\s*(\d+)/i, stdout),
    urls,
    files: {
      dualValidation: await readProjectFile("dual_validation_results.csv"),
      verified: await readProjectFile("verified_youtube_creators.csv"),
      bouncifyUpload: await readProjectFile("bouncify_upload.csv"),
      rawResults: await readProjectFile("apify_raw_results.json")
    }
  };

  history.push(entry);
  await fs.writeFile(SCRAPE_HISTORY_FILE, JSON.stringify(history.slice(-100), null, 2), "utf8");
  return entry;
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const urls = [...new Set(parseUrls(body.urls))];

  if (!urls.length) {
    return NextResponse.json({ error: "Add at least one YouTube channel URL." }, { status: 400 });
  }

  if (urls.length > CHANNEL_LIMIT) {
    return NextResponse.json({ error: `Submit ${CHANNEL_LIMIT} channels or fewer per run.` }, { status: 400 });
  }

  const invalidUrls = urls.filter((url) => !YOUTUBE_URL_PATTERN.test(url));
  if (invalidUrls.length) {
    return NextResponse.json(
      { error: "Only YouTube channel URLs are accepted.", invalidUrls },
      { status: 400 }
    );
  }

  try {
    const result = await runScraper(urls);
    await fs.writeFile(
      LAST_FRONTEND_SCRAPE_FILE,
      JSON.stringify(
        {
          submittedAt: new Date().toISOString(),
          urls
        },
        null,
        2
      ),
      "utf8"
    );
    const historyEntry = await appendScrapeHistory({ urls, stdout: result.stdout });

    return NextResponse.json({
      ok: true,
      submitted: urls.length,
      historyId: historyEntry.id,
      stdout: result.stdout,
      stderr: result.stderr
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message || "Scraper failed.",
        submitted: urls.length
      },
      { status: 500 }
    );
  }
}
