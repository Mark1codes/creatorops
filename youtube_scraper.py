import csv
import base64
import json
import os
import re
import sys
import time
from io import StringIO
from pathlib import Path
from urllib.parse import urlencode

import requests
from apify_client import ApifyClient
from apify_client.errors import ApifyApiError


BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"
OUTPUT_FILE = BASE_DIR / "verified_youtube_creators.csv"
ALL_CHECKS_FILE = BASE_DIR / "all_bouncify_checks.csv"
RAW_APIFY_FILE = BASE_DIR / "apify_raw_results.json"
BULK_JOB_FILE = BASE_DIR / "bouncify_bulk_jobs.csv"
BOUNCIFY_UPLOAD_FILE = BASE_DIR / "bouncify_upload.csv"
DUAL_VALIDATION_FILE = BASE_DIR / "dual_validation_results.csv"
DEFAULT_ACTOR_ID = "crawlerbros/youtube-email-scraper"
SAVEABLE_BOUNCIFY_RESULTS = {"deliverable", "accept-all", "accept_all", "accept all", "unknown"}
SAVEABLE_ZEROBOUNCE_RESULTS = {"valid", "catch-all", "unknown"}
EMAIL_PATTERN = re.compile(r"^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def load_env(path: Path) -> None:
    """Load simple KEY=VALUE pairs from .env without an extra dependency."""
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key and key not in os.environ:
            os.environ[key] = value


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value or value.startswith("YOUR_"):
        raise RuntimeError(f"Missing {name}. Add it to {ENV_FILE.name} first.")
    return value


def parse_channels(raw_channels: str) -> list[str]:
    channels = []
    for line in raw_channels.replace(",", "\n").splitlines():
        url = line.strip()
        if url:
            channels.append(url)
    return channels


def parse_providers(raw_providers: str) -> set[str]:
    providers = {
        provider.strip().lower()
        for provider in raw_providers.replace(";", ",").split(",")
        if provider.strip()
    }
    return providers or {"bouncify"}


def verify_bouncify_email(email: str, api_key: str) -> str:
    params = urlencode({"apikey": api_key, "email": email, "timeout": 30000})
    url = f"https://api.bouncify.io/v1/verify?{params}"

    response = requests.get(url, timeout=30)
    response.raise_for_status()
    result = response.json()

    return result.get("result", result.get("status", "unknown"))


def verify_zerobounce_email(email: str, api_key: str) -> str:
    params = urlencode({"api_key": api_key, "email": email})
    url = f"https://api.zerobounce.net/v2/validate?{params}"

    response = requests.get(url, timeout=30)
    response.raise_for_status()
    result = response.json()

    return result.get("status", "unknown")


def validate_email(email: str, providers: set[str], bouncify_key: str, zerobounce_key: str) -> dict:
    results = {
        "bouncify_status": "not_checked",
        "zerobounce_status": "not_checked",
    }

    if "bouncify" in providers:
        try:
            results["bouncify_status"] = verify_bouncify_email(email, bouncify_key)
        except Exception as exc:
            print(f"Error checking Bouncify for {email}: {exc}")
            results["bouncify_status"] = "error"

    if "zerobounce" in providers:
        if not zerobounce_key or zerobounce_key.startswith("YOUR_"):
            results["zerobounce_status"] = "missing_key"
        else:
            try:
                results["zerobounce_status"] = verify_zerobounce_email(email, zerobounce_key)
            except Exception as exc:
                print(f"Error checking ZeroBounce for {email}: {exc}")
                results["zerobounce_status"] = "error"

    return results


def is_saveable_result(provider: str, status: str) -> bool:
    normalized = status.lower()
    if provider == "bouncify":
        return normalized in SAVEABLE_BOUNCIFY_RESULTS
    if provider == "zerobounce":
        return normalized in SAVEABLE_ZEROBOUNCE_RESULTS
    return False


def upload_bouncify_bulk_list(profiles: list[dict], api_key: str) -> dict:
    emails = get_unique_valid_emails(profiles)

    if not emails:
        raise RuntimeError("No emails were found, so there is nothing to upload to Bouncify.")

    csv_text = "email\r\n" + "\r\n".join(emails) + "\r\n"

    csv_bytes = csv_text.encode("ascii")
    BOUNCIFY_UPLOAD_FILE.write_bytes(csv_bytes)
    encoded_csv = base64.b64encode(csv_bytes).decode("ascii")

    response = requests.post(
        "https://api.bouncify.io/v1/bulk",
        params={"apikey": api_key},
        data={
            "auto_verify": "true",
        },
        files={
            "local_file": ("youtube_creators.csv", csv_bytes, "text/csv"),
        },
        headers={
            "Accept": "application/json",
        },
        timeout=60,
    )

    if not response.ok:
        response = requests.post(
            "https://api.bouncify.io/v1/bulk",
            params={"apikey": api_key},
            json={
                "apikey": api_key,
                "auto_verify": True,
                "local_file": f"data:text/csv;name=youtube_creators.csv;base64,{encoded_csv}",
            },
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            timeout=60,
        )

    if not response.ok:
        raise RuntimeError(
            f"Bouncify bulk upload failed with HTTP {response.status_code}: {response.text}"
        )

    return response.json()


def save_bulk_job(job: dict) -> None:
    fields = ["job_id", "success", "message"]
    file_exists = BULK_JOB_FILE.exists()

    with BULK_JOB_FILE.open(mode="a", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        if not file_exists:
            writer.writeheader()
        writer.writerow(
            {
                "job_id": job.get("job_id", ""),
                "success": job.get("success", ""),
                "message": job.get("message", ""),
            }
        )


def build_run_input(actor_id: str, target_channels: list[str]) -> dict:
    if actor_id == "crawlerbros/youtube-email-scraper":
        return {
            "channelUrls": target_channels,
            "followExternalProfiles": True,
            "maxExternalPerChannel": 3,
            "autoProxyFallback": True,
        }

    return {
        "startUrls": [{"url": url} for url in target_channels],
    }


def normalize_profiles(raw_results: list[dict]) -> list[dict]:
    profiles = []

    for item in raw_results:
        emails = item.get("emails")
        if isinstance(emails, list):
            for email in emails:
                profiles.append(
                    {
                        "channel_name": item.get("channelName", item.get("title", "Unknown")),
                        "channel_url": item.get("channelUrl", item.get("url", "")),
                        "email": str(email).strip(),
                    }
                )
            continue

        profiles.append(
            {
                "channel_name": item.get("channelName", item.get("title", "Unknown")),
                "channel_url": item.get("channelUrl", item.get("url", "")),
                "email": str(item.get("email", "")).strip(),
            }
        )

    return profiles


def get_unique_valid_emails(profiles: list[dict]) -> list[str]:
    return sorted(
        {
            profile["email"].strip()
            for profile in profiles
            if profile["email"] and EMAIL_PATTERN.match(profile["email"].strip())
        }
    )


def get_default_dataset_id(run) -> str:
    if isinstance(run, dict):
        return run["defaultDatasetId"]

    dataset_id = getattr(run, "default_dataset_id", None)
    if dataset_id:
        return dataset_id

    dataset_id = getattr(run, "defaultDatasetId", None)
    if dataset_id:
        return dataset_id

    raise RuntimeError("Apify run finished, but no default dataset ID was returned.")


def main() -> None:
    load_env(ENV_FILE)

    apify_token = require_env("APIFY_TOKEN")
    bouncify_key = require_env("BOUNCIFY_KEY")
    zerobounce_key = os.getenv("ZEROBOUNCE_API_KEY", "").strip()
    validation_providers = parse_providers(os.getenv("VALIDATION_PROVIDERS", "bouncify"))
    actor_id = os.getenv("APIFY_ACTOR_ID", DEFAULT_ACTOR_ID).strip() or DEFAULT_ACTOR_ID
    bouncify_mode = os.getenv("BOUNCIFY_MODE", "bulk").strip().lower()
    target_channels = parse_channels(os.getenv("TARGET_CHANNELS_OVERRIDE") or os.getenv("TARGET_CHANNELS", ""))

    if not target_channels:
        raise RuntimeError("Missing TARGET_CHANNELS. Add at least one YouTube channel URL to .env.")
    if bouncify_mode not in {"bulk", "single"}:
        raise RuntimeError("BOUNCIFY_MODE must be either 'bulk' or 'single'.")
    unsupported_providers = validation_providers - {"bouncify", "zerobounce"}
    if unsupported_providers:
        raise RuntimeError(f"Unsupported validation provider(s): {', '.join(sorted(unsupported_providers))}")

    client = ApifyClient(apify_token)

    print(f"Starting Apify scraper for {len(target_channels)} channel(s)...")

    run_input = build_run_input(actor_id, target_channels)

    try:
        run = client.actor(actor_id).call(run_input=run_input)
    except ApifyApiError as exc:
        if "must rent a paid Actor" in str(exc):
            raise RuntimeError(
                f"Apify refused access to actor '{actor_id}'. This actor now requires paid rental. "
                "Rent it in Apify, or set APIFY_ACTOR_ID in .env to another YouTube email scraper actor "
                "that your Apify account can run."
            ) from exc
        raise

    raw_results = list(client.dataset(get_default_dataset_id(run)).iterate_items())
    RAW_APIFY_FILE.write_text(json.dumps(raw_results, indent=2, ensure_ascii=False), encoding="utf-8")

    profiles = normalize_profiles(raw_results)
    email_candidates = [profile for profile in profiles if profile["email"]]
    unique_valid_emails = get_unique_valid_emails(profiles)

    print("Scraping summary:")
    print(f"- Target channels submitted: {len(target_channels)}")
    print(f"- Apify channel records returned: {len(raw_results)}")
    print(f"- Email values scraped: {len(email_candidates)}")
    print(f"- Unique valid emails found: {len(unique_valid_emails)}")
    if unique_valid_emails:
        print("- Emails found:")
        for email in unique_valid_emails:
            print(f"  - {email}")
    print(f"Raw Apify results saved in: {RAW_APIFY_FILE}")

    if not profiles:
        print("No public emails were found, so no validation checks were sent.")

    if bouncify_mode == "bulk" and "bouncify" in validation_providers:
        if not unique_valid_emails:
            print("No valid emails were found, so Bouncify bulk upload was skipped.")
            return

        print("Uploading scraped emails to Bouncify Bulk Verification...")
        bulk_job = upload_bouncify_bulk_list(profiles, bouncify_key)
        save_bulk_job(bulk_job)

        print("Bouncify upload summary:")
        print(f"- Emails uploaded: {len(unique_valid_emails)}")
        print(f"Bouncify bulk job created: {bulk_job.get('job_id', 'unknown')}")
        print(f"Bouncify message: {bulk_job.get('message', 'No message returned')}")
        print(f"Bulk job history saved in: {BULK_JOB_FILE}")
        print("Open or refresh Bouncify > Bulk Verification to see the new list.")

        if validation_providers == {"bouncify"}:
            return

        print("Continuing with single-check validation for the enabled providers...")

    fields = ["Channel Name", "Channel URL", "Scraped Email", "Bouncify Status", "ZeroBounce Status"]
    bouncify_fields = ["Channel Name", "Channel URL", "Scraped Email", "Bouncify Status"]
    file_exists = OUTPUT_FILE.exists()
    all_checks_exists = ALL_CHECKS_FILE.exists()
    dual_file_exists = DUAL_VALIDATION_FILE.exists()

    with OUTPUT_FILE.open(mode="a", newline="", encoding="utf-8") as file, ALL_CHECKS_FILE.open(
        mode="a", newline="", encoding="utf-8"
    ) as all_checks_file, DUAL_VALIDATION_FILE.open(mode="a", newline="", encoding="utf-8") as dual_file:
        writer = csv.DictWriter(file, fieldnames=fields)
        all_checks_writer = csv.DictWriter(all_checks_file, fieldnames=bouncify_fields)
        dual_writer = csv.DictWriter(dual_file, fieldnames=fields)

        if not file_exists:
            writer.writeheader()
        if not all_checks_exists:
            all_checks_writer.writeheader()
        if not dual_file_exists:
            dual_writer.writeheader()

        for profile in profiles:
            channel_name = profile["channel_name"]
            channel_url = profile["channel_url"]
            email = profile["email"]

            if not email:
                print(f"Skipped {channel_name} because no email was found.")
                continue

            print(f"Verifying email for {channel_name}: {email}...")

            validation = validate_email(email, validation_providers, bouncify_key, zerobounce_key)
            bouncify_status = validation["bouncify_status"]
            zerobounce_status = validation["zerobounce_status"]
            print(f"- Bouncify: {bouncify_status}")
            print(f"- ZeroBounce: {zerobounce_status}")

            row = {
                "Channel Name": channel_name,
                "Channel URL": channel_url,
                "Scraped Email": email,
                "Bouncify Status": bouncify_status,
                "ZeroBounce Status": zerobounce_status,
            }

            all_checks_writer.writerow(
                {
                    "Channel Name": channel_name,
                    "Channel URL": channel_url,
                    "Scraped Email": email,
                    "Bouncify Status": bouncify_status,
                }
            )
            dual_writer.writerow(row)

            bouncify_ok = "bouncify" in validation_providers and is_saveable_result("bouncify", bouncify_status)
            zerobounce_ok = "zerobounce" in validation_providers and is_saveable_result("zerobounce", zerobounce_status)

            if bouncify_ok or zerobounce_ok:
                writer.writerow(row)
                print(f"Safe email saved: {email}")
            else:
                print("Email discarded.")

            time.sleep(0.25)

    print(f"\nAll done. Clean data is saved in: {OUTPUT_FILE}")
    print(f"Dual-provider results saved in: {DUAL_VALIDATION_FILE}")


if __name__ == "__main__":
    main()
