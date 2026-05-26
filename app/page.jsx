"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  CloudUpload,
  Database,
  Download,
  History,
  FileCheck2,
  LayoutDashboard,
  Loader2,
  MailCheck,
  Menu,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Youtube
} from "lucide-react";

const emptyData = {
  config: {
    targetChannels: [],
    activeTargetChannels: [],
    latestSubmittedChannels: [],
    latestSubmittedAt: "",
    providers: "bouncify",
    bouncifyMode: "single",
    actorId: "not configured"
  },
  channels: [],
  emails: [],
  jobs: [],
  scrapeHistory: [],
  dualValidation: [],
  verified: [],
  allChecks: [],
  files: {}
};

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "-";
  return new Intl.NumberFormat().format(number);
}

function statusClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (["valid", "deliverable", "accept all", "accept-all", "catch-all"].includes(normalized)) {
    return "statusGood";
  }
  if (["unknown", "not_checked", "missing_key"].includes(normalized)) {
    return "statusNeutral";
  }
  if (!normalized || normalized === "-") {
    return "statusMuted";
  }
  return "statusBad";
}

function shortUrl(url) {
  return String(url || "").replace("https://www.youtube.com/", "");
}

function PanelHeader({ kicker, title, action }) {
  return (
    <div className="panelHeader">
      <div>
        <span className="sectionLabel">{kicker}</span>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [manualEmail, setManualEmail] = useState("");
  const [manualResult, setManualResult] = useState(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState("");
  const [scrapeUrls, setScrapeUrls] = useState("");
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const [scrapeOutput, setScrapeOutput] = useState("");

  async function loadDashboard() {
    setLoading(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = await response.json();
      setData(payload);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const latestJob = data.jobs.at(-1) || {};
  const providerRows = data.dualValidation.slice(-10).reverse();
  const activeTargetChannels = data.config.activeTargetChannels?.length
    ? data.config.activeTargetChannels
    : data.config.targetChannels;

  const stats = useMemo(() => {
    const emailValues = data.channels.reduce((total, channel) => {
      return total + (Array.isArray(channel.emails) ? channel.emails.length : 0);
    }, 0);

    return [
      {
        label: "Target Channels",
        value: activeTargetChannels.length,
        detail: `${data.channels.length} returned from Apify`,
        icon: Youtube,
        tone: "lime"
      },
      {
        label: "Unique Emails",
        value: data.emails.length,
        detail: `${emailValues} raw email values`,
        icon: MailCheck,
        tone: "green"
      },
      {
        label: "Dual Checks",
        value: data.dualValidation.length,
        detail: data.config.providers,
        icon: ShieldCheck,
        tone: "blue"
      },
      {
        label: "Verified Saved",
        value: data.verified.length,
        detail: "rows in verified CSV",
        icon: BadgeCheck,
        tone: "ink"
      }
    ];
  }, [data, activeTargetChannels.length]);

  const navItems = useMemo(() => {
    return [
      { id: "overview", label: "Overview", icon: LayoutDashboard, count: data.channels.length },
      { id: "channels", label: "Channels", icon: Youtube, count: data.channels.length },
      { id: "emails", label: "Email Queue", icon: MailCheck, count: data.emails.length },
      { id: "validation", label: "Validation", icon: ShieldCheck, count: data.dualValidation.length },
      { id: "history", label: "History", icon: History, count: data.scrapeHistory.length },
      { id: "settings", label: "Settings", icon: Settings2, count: data.jobs.length }
    ];
  }, [data]);

  const filteredChannels = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data.channels;

    return data.channels.filter((channel) => {
      return [
        channel.channelName,
        channel.channelHandle,
        channel.channelUrl,
        Array.isArray(channel.emails) ? channel.emails.join(" ") : ""
      ].join(" ").toLowerCase().includes(needle);
    });
  }, [data.channels, query]);

  function selectView(view) {
    setActiveView(view);
    setSidebarOpen(false);
  }

  async function validateManualEmail(event) {
    event.preventDefault();
    setManualLoading(true);
    setManualError("");
    setManualResult(null);

    try {
      const response = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: manualEmail })
      });
      const payload = await response.json();

      if (!response.ok) {
        setManualError(payload.error || "Validation failed.");
        return;
      }

      setManualResult(payload);
    } finally {
      setManualLoading(false);
    }
  }

  async function runFrontendScrape(event) {
    event.preventDefault();
    setScrapeLoading(true);
    setScrapeError("");
    setScrapeOutput("");

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: scrapeUrls })
      });
      const payload = await response.json();

      if (!response.ok) {
        setScrapeError(payload.error || "Scrape failed.");
        if (payload.invalidUrls?.length) {
          setScrapeOutput(payload.invalidUrls.join("\n"));
        }
        return;
      }

      setScrapeOutput(payload.stdout || "Scrape completed.");
      await loadDashboard();
    } finally {
      setScrapeLoading(false);
    }
  }

  return (
    <div className="appFrame">
      <aside className={`sidebar ${sidebarOpen ? "sidebarOpen" : ""}`}>
        <div className="brandBlock">
          <div className="brandMark">
            <Sparkles size={20} />
          </div>
          <div>
            <p className="brandName">Creator Ops</p>
            <span className="brandMeta">{data.channels.length} latest records</span>
          </div>
        </div>

        <nav className="navigation" aria-label="Dashboard navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`navItem ${activeView === item.id ? "active" : ""}`}
                key={item.id}
                type="button"
                onClick={() => selectView(item.id)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </button>
            );
          })}
        </nav>

        <div className="sidebarFooter">
          <div className="pulseDot" />
          <div>
            <strong>{loading ? "Refreshing" : "Live data"}</strong>
            <span>{data.config.providers}</span>
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <button className="iconButton mobileMenu" type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label="Toggle sidebar">
            <Menu size={20} />
          </button>
          <div className="titleGroup">
            <span className="pageKicker">YouTube scraper</span>
            <h1>{navItems.find((item) => item.id === activeView)?.label || "Dashboard"}</h1>
          </div>
          <div className="topbarActions">
            <button className="iconButton" type="button" onClick={loadDashboard} aria-label="Refresh dashboard">
              {loading ? <Loader2 className="spin" size={19} /> : <RefreshCw size={19} />}
            </button>
            <a className="primaryAction" href="/api/download/dual_validation_results.csv">
              <Download size={18} />
              <span>Results</span>
            </a>
            <a className="secondaryAction" href="/api/download/valid_emails.csv">
              <MailCheck size={18} />
              <span>Valid Emails</span>
            </a>
          </div>
        </header>

        <section className="statusStrip">
          <div>
            <span className="tinyLabel">Providers</span>
            <strong>{data.config.providers}</strong>
          </div>
          <div>
            <span className="tinyLabel">Bouncify Mode</span>
            <strong>{data.config.bouncifyMode}</strong>
          </div>
          <div>
            <span className="tinyLabel">Last Read</span>
            <strong>{data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</strong>
          </div>
          <div>
            <span className="tinyLabel">Latest Frontend Run</span>
            <strong>{data.config.latestSubmittedAt ? new Date(data.config.latestSubmittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "No frontend run"}</strong>
          </div>
        </section>

        {activeView === "overview" && (
          <>
            <ScrapeRunner
              urls={scrapeUrls}
              setUrls={setScrapeUrls}
              loading={scrapeLoading}
              error={scrapeError}
              output={scrapeOutput}
              onSubmit={runFrontendScrape}
            />

            <section className="metricsGrid" aria-label="Key metrics">
              {stats.map((item) => {
                const Icon = item.icon;
                return (
                  <article className={`metricCard ${item.tone}`} key={item.label}>
                    <div className="metricIcon">
                      <Icon size={21} />
                    </div>
                    <div>
                      <p>{item.label}</p>
                      <strong>{item.value}</strong>
                      <span>{item.detail}</span>
                    </div>
                  </article>
                );
              })}
            </section>

            <section className="mainGrid">
              <ChannelTable channels={filteredChannels.slice(0, 12)} query={query} setQuery={setQuery} />
              <EmailQueue emails={data.emails} latestJob={latestJob} />
            </section>

            <section className="lowerGrid">
              <ValidationPanel rows={providerRows} />
              <FilePanel files={data.files} />
            </section>
          </>
        )}

        {activeView === "channels" && (
          <section className="singleGrid">
            <ScrapeRunner
              urls={scrapeUrls}
              setUrls={setScrapeUrls}
              loading={scrapeLoading}
              error={scrapeError}
              output={scrapeOutput}
              onSubmit={runFrontendScrape}
            />
            <ChannelTable channels={filteredChannels} query={query} setQuery={setQuery} />
            <TargetList targetChannels={activeTargetChannels} channels={data.channels} />
          </section>
        )}

        {activeView === "emails" && (
          <section className="singleGrid">
            <ManualValidator
              email={manualEmail}
              setEmail={setManualEmail}
              result={manualResult}
              error={manualError}
              loading={manualLoading}
              onSubmit={validateManualEmail}
            />
            <EmailQueue emails={data.emails} latestJob={latestJob} full />
            <VerifiedTable rows={data.verified} />
          </section>
        )}

        {activeView === "validation" && (
          <section className="singleGrid">
            <ManualValidator
              email={manualEmail}
              setEmail={setManualEmail}
              result={manualResult}
              error={manualError}
              loading={manualLoading}
              onSubmit={validateManualEmail}
            />
            <ValidationPanel rows={data.dualValidation.slice().reverse()} full />
            <AllChecksTable rows={data.allChecks} />
          </section>
        )}

        {activeView === "history" && (
          <section className="singleGrid">
            <HistoryPanel history={data.scrapeHistory} />
          </section>
        )}

        {activeView === "settings" && (
          <section className="settingsGrid">
            <ConfigPanel config={data.config} />
            <FilePanel files={data.files} />
            <JobsPanel jobs={data.jobs} />
          </section>
        )}
      </main>
    </div>
  );
}

function HistoryPanel({ history }) {
  const orderedHistory = history.slice().reverse();

  return (
    <div className="panel historyPanel">
      <PanelHeader kicker="Previous runs" title="Scrape History" action={<History size={20} />} />
      <div className="historyList">
        {orderedHistory.map((entry) => (
          <article className="historyItem" key={entry.id}>
            <div className="historyMain">
              <div>
                <strong>{new Date(entry.submittedAt).toLocaleString()}</strong>
                <span>{entry.submittedCount} submitted • {entry.returnedCount} returned • {entry.emailCount} emails</span>
              </div>
              <div className="historyDownloads">
                <a href={`/api/history/${entry.id}/download/dual-validation.csv`}>Dual CSV</a>
                <a href={`/api/history/${entry.id}/download/verified-emails.csv`}>Valid CSV</a>
                <a href={`/api/history/${entry.id}/download/raw-results.json`}>Raw JSON</a>
              </div>
            </div>
            <div className="historyChannels">
              {entry.urls.map((url) => (
                <a href={url} target="_blank" rel="noreferrer" key={url}>{shortUrl(url)}</a>
              ))}
            </div>
          </article>
        ))}
        {!history.length && <p className="emptyText">No frontend scrape history yet. Run a scrape from the dashboard first.</p>}
      </div>
    </div>
  );
}

function ScrapeRunner({ urls, setUrls, loading, error, output, onSubmit }) {
  return (
    <section className="panel scrapePanel">
      <PanelHeader
        kicker="Run scraper"
        title="Submit YouTube Channel URLs"
        action={
          <span className="runHint">One URL per line, comma-separated also works</span>
        }
      />

      <form className="scrapeForm" onSubmit={onSubmit}>
        <textarea
          value={urls}
          onChange={(event) => setUrls(event.target.value)}
          placeholder={"https://www.youtube.com/@mkbhd\nhttps://www.youtube.com/@freecodecamp"}
          rows={3}
        />
        <button className="primaryAction runButton" type="submit" disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
          <span>{loading ? "Running" : "Run Scraper"}</span>
        </button>
      </form>

      {error && <p className="formError">{error}</p>}
      {output && <pre className="scrapeOutput">{output}</pre>}
    </section>
  );
}

function ManualValidator({ email, setEmail, result, error, loading, onSubmit }) {
  return (
    <div className="panel manualPanel">
      <PanelHeader
        kicker="Live check"
        title="Validate One Email With Both Providers"
        action={
          <a className="secondaryAction compactAction" href="/api/download/valid_emails.csv">
            <Download size={17} />
            <span>Valid CSV</span>
          </a>
        }
      />

      <form className="validatorForm" onSubmit={onSubmit}>
        <div className="validatorInput">
          <MailCheck size={18} />
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            type="email"
          />
        </div>
        <button className="primaryAction validateButton" type="submit" disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
          <span>{loading ? "Checking" : "Validate"}</span>
        </button>
      </form>

      {error && <p className="formError">{error}</p>}

      {result && (
        <div className="manualResult">
          <strong>{result.email}</strong>
          <div className="statusPair">
            <span className={`statusPill ${statusClass(result.bouncifyStatus)}`}>Bouncify: {result.bouncifyStatus}</span>
            <span className={`statusPill ${statusClass(result.zeroBounceStatus)}`}>ZeroBounce: {result.zeroBounceStatus}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelTable({ channels, query, setQuery }) {
  return (
    <div className="panel channelPanel">
      <PanelHeader
        kicker="Scrape output"
        title="Channel Records"
        action={
          <div className="searchBox">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search channels" />
          </div>
        }
      />

      <div className="tableScroller">
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Handle</th>
              <th>Subscribers</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((channel) => {
              const emailCount = Array.isArray(channel.emails) ? channel.emails.length : 0;
              return (
                <tr key={channel.channelUrl || channel.channelName}>
                  <td>
                    <a className="channelName" href={channel.channelUrl} target="_blank" rel="noreferrer">
                      {channel.channelName || "Unknown channel"}
                    </a>
                  </td>
                  <td>{channel.channelHandle || "-"}</td>
                  <td>{formatNumber(channel.subscriberCount)}</td>
                  <td>
                    <span className={`statusPill ${emailCount ? "statusGood" : "statusMuted"}`}>
                      {emailCount ? `${emailCount} found` : "none"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!channels.length && (
              <tr>
                <td className="emptyCell" colSpan={4}>Run the scraper, then refresh this dashboard.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmailQueue({ emails, latestJob, full = false }) {
  const visibleEmails = full ? emails : emails.slice(0, 12);

  return (
    <aside className="panel queuePanel">
      <PanelHeader kicker="Email queue" title={full ? "All Scraped Emails" : "Ready to Validate"} />

      <div className="emailStack">
        {visibleEmails.map((email) => (
          <div className="emailItem" key={email}>
            <CheckCircle2 size={17} />
            <span>{email}</span>
          </div>
        ))}
        {!emails.length && <p className="emptyText">No scraped emails found in the latest output.</p>}
      </div>

      <div className="jobSummary">
        <span className="sectionLabel">Latest Bouncify Job</span>
        <strong>{latestJob.job_id || "No bulk job yet"}</strong>
        <p>{latestJob.message || "Bulk upload history appears here after Bouncify accepts a job."}</p>
      </div>
    </aside>
  );
}

function ValidationPanel({ rows, full = false }) {
  const visibleRows = full ? rows : rows.slice(0, 10);

  return (
    <div className="panel validationPanel">
      <PanelHeader kicker="Provider comparison" title="Validation Results" action={<BarChart3 size={20} />} />

      <div className="validationList">
        {visibleRows.map((row, index) => (
          <div className="validationRow" key={`${row["Scraped Email"]}-${index}`}>
            <div>
              <strong>{row["Scraped Email"] || "Unknown email"}</strong>
              <span>{row["Channel Name"] || "Unknown channel"}</span>
            </div>
            <div className="statusPair">
              <span className={`statusPill ${statusClass(row["Bouncify Status"])}`}>B: {row["Bouncify Status"] || "-"}</span>
              <span className={`statusPill ${statusClass(row["ZeroBounce Status"])}`}>Z: {row["ZeroBounce Status"] || "-"}</span>
            </div>
          </div>
        ))}
        {!rows.length && <p className="emptyText">Dual validation results will appear after your next run.</p>}
      </div>
    </div>
  );
}

function FilePanel({ files }) {
  const fileRows = [
    ["apifyRawResults", "Apify raw results", FileCheck2],
    ["dualValidation", "Dual validation CSV", ClipboardList],
    ["verified", "Verified creators", BadgeCheck],
    ["bouncifyJobs", "Bouncify jobs", CloudUpload],
    ["allChecks", "Bouncify checks", Database]
  ];

  return (
    <div className="panel filePanel">
      <PanelHeader kicker="Local outputs" title="File Health" action={<Database size={20} />} />
      <div className="fileGrid">
        {fileRows.map(([key, label, Icon]) => (
          <div className="fileTile" key={key}>
            <Icon size={18} />
            <div>
              <strong>{label}</strong>
              <span>{files[key] ? "Available" : "Waiting"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TargetList({ targetChannels, channels }) {
  const returnedUrls = new Set(channels.map((channel) => String(channel.channelUrl || "").replace("/about", "")));

  return (
    <div className="panel targetPanel">
      <PanelHeader kicker="Configuration" title="Target Channels" />
      <div className="targetList">
        {targetChannels.map((url) => {
          const normalized = url.replace("/about", "");
          return (
            <a className="targetItem" href={url} target="_blank" rel="noreferrer" key={url}>
              <Youtube size={17} />
              <span>{shortUrl(url)}</span>
              <strong className={returnedUrls.has(normalized) ? "available" : ""}>
                {returnedUrls.has(normalized) ? "returned" : "queued"}
              </strong>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function VerifiedTable({ rows }) {
  return (
    <div className="panel">
      <PanelHeader kicker="Saved output" title="Verified Creator Rows" />
      <div className="tableScroller">
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Email</th>
              <th>Bouncify</th>
              <th>ZeroBounce</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row["Scraped Email"]}-${index}`}>
                <td>{row["Channel Name"] || "-"}</td>
                <td>{row["Scraped Email"] || "-"}</td>
                <td><span className={`statusPill ${statusClass(row["Bouncify Status"])}`}>{row["Bouncify Status"] || "-"}</span></td>
                <td><span className={`statusPill ${statusClass(row["ZeroBounce Status"])}`}>{row["ZeroBounce Status"] || "-"}</span></td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="emptyCell" colSpan={4}>No verified rows saved yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AllChecksTable({ rows }) {
  return (
    <div className="panel">
      <PanelHeader kicker="Bouncify history" title="All Check Rows" />
      <div className="tableScroller">
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Email</th>
              <th>Bouncify</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row["Scraped Email"]}-${index}`}>
                <td>{row["Channel Name"] || "-"}</td>
                <td>{row["Scraped Email"] || "-"}</td>
                <td><span className={`statusPill ${statusClass(row["Bouncify Status"])}`}>{row["Bouncify Status"] || "-"}</span></td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="emptyCell" colSpan={3}>No Bouncify check rows saved yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfigPanel({ config }) {
  const rows = [
    ["Actor", config.actorId],
    ["Providers", config.providers],
    ["Bouncify Mode", config.bouncifyMode],
    ["Configured Target Count", config.targetChannels.length],
    ["Latest Submitted Count", config.latestSubmittedChannels?.length || 0],
    ["Latest Frontend Run", config.latestSubmittedAt ? new Date(config.latestSubmittedAt).toLocaleString() : "No frontend run"]
  ];

  return (
    <div className="panel configPanel">
      <PanelHeader kicker="Runtime config" title="Current Settings" action={<Settings2 size={20} />} />
      <div className="configRows">
        {rows.map(([label, value]) => (
          <div className="configRow" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobsPanel({ jobs }) {
  return (
    <div className="panel">
      <PanelHeader kicker="Bouncify" title="Bulk Job History" />
      <div className="validationList">
        {jobs.slice().reverse().map((job, index) => (
          <div className="validationRow" key={`${job.job_id}-${index}`}>
            <div>
              <strong>{job.job_id || "Unknown job"}</strong>
              <span>{job.message || "No message returned"}</span>
            </div>
            <span className={`statusPill ${String(job.success).toLowerCase() === "true" ? "statusGood" : "statusNeutral"}`}>
              {job.success || "pending"}
            </span>
          </div>
        ))}
        {!jobs.length && <p className="emptyText">No Bouncify bulk jobs recorded yet.</p>}
      </div>
    </div>
  );
}
