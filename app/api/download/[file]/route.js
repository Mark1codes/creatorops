import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const ROOT = process.cwd();
const ALLOWED_FILES = new Set([
  "valid_emails.csv",
  "dual_validation_results.csv",
  "verified_youtube_creators.csv",
  "all_bouncify_checks.csv",
  "bouncify_upload.csv",
  "bouncify_bulk_jobs.csv",
  "apify_raw_results.json"
]);

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

function escapeCsv(value) {
  const text = String(value || "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function isGoodStatus(provider, status) {
  const normalized = String(status || "").toLowerCase();
  if (provider === "bouncify") {
    return ["deliverable", "accept-all", "accept_all", "accept all", "unknown"].includes(normalized);
  }
  if (provider === "zerobounce") {
    return ["valid", "catch-all", "unknown"].includes(normalized);
  }
  return false;
}

async function buildValidEmailsCsv() {
  const dualText = await fs.readFile(path.join(ROOT, "dual_validation_results.csv"), "utf8");
  const rows = parseCsv(dualText);
  const validRows = rows.filter((row) => {
    return (
      isGoodStatus("bouncify", row["Bouncify Status"]) ||
      isGoodStatus("zerobounce", row["ZeroBounce Status"])
    );
  });

  const headers = ["Channel Name", "Channel URL", "Scraped Email", "Bouncify Status", "ZeroBounce Status"];
  const lines = [
    headers.join(","),
    ...validRows.map((row) => headers.map((header) => escapeCsv(row[header])).join(","))
  ];

  return lines.join("\r\n") + "\r\n";
}

export async function GET(_request, { params }) {
  const fileName = params.file;

  if (!ALLOWED_FILES.has(fileName)) {
    return NextResponse.json({ error: "File is not available for download." }, { status: 404 });
  }

  try {
    const data = fileName === "valid_emails.csv"
      ? await buildValidEmailsCsv()
      : await fs.readFile(path.join(ROOT, fileName));
    const contentType = fileName.endsWith(".json") ? "application/json" : "text/csv";

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`
      }
    });
  } catch {
    return NextResponse.json({ error: "File was not found. Run the scraper first." }, { status: 404 });
  }
}
