import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const HISTORY_FILE = path.join(process.cwd(), "scrape_history.json");
const FILE_MAP = {
  "dual-validation.csv": ["dualValidation", "text/csv"],
  "verified-emails.csv": ["verified", "text/csv"],
  "bouncify-upload.csv": ["bouncifyUpload", "text/csv"],
  "raw-results.json": ["rawResults", "application/json"]
};

export async function GET(_request, { params }) {
  const mapping = FILE_MAP[params.file];

  if (!mapping) {
    return NextResponse.json({ error: "History file is not available." }, { status: 404 });
  }

  try {
    const history = JSON.parse(await fs.readFile(HISTORY_FILE, "utf8"));
    const entry = history.find((item) => item.id === params.id);

    if (!entry) {
      return NextResponse.json({ error: "History run was not found." }, { status: 404 });
    }

    const [fileKey, contentType] = mapping;
    const content = entry.files?.[fileKey] || "";

    if (!content) {
      return NextResponse.json({ error: "This history run does not have that file." }, { status: 404 });
    }

    return new NextResponse(content, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${entry.id}-${params.file}"`
      }
    });
  } catch {
    return NextResponse.json({ error: "History is not available yet." }, { status: 404 });
  }
}
