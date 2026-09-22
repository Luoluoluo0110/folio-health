import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  CloudDownload,
  FileHeart,
  FilePlus2,
  FileText,
  Fingerprint,
  FlaskConical,
  Heart,
  HeartPulse,
  History,
  Hospital,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Upload,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
} from "recharts";
import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import type {
  State,
  HealthRecord,
  RecordType,
  MetricKey,
  Grant,
} from "./types";
import "./styles.css";

const recordTypes: RecordType[] = [
  "Lab result",
  "Visit summary",
  "Prescription",
  "Imaging",
  "Allergy",
];
const today = () => new Date().toISOString().slice(0, 10);
const shortDate = (d: string) =>
  new Date(d.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const shortTime = (d: string) =>
  new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const initials = (s: string) =>
  s
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const metricInfo: Record<
  MetricKey,
  { label: string; unit: string; icon: typeof Heart; color: string }
> = {
  systolic: {
    label: "Blood pressure",
    unit: "mmHg",
    icon: HeartPulse,
    color: "#34796e",
  },
  glucose: {
    label: "Blood glucose",
    unit: "mg/dL",
    icon: FlaskConical,
    color: "#b08d5c",
  },
  heartRate: {
    label: "Resting heart rate",
    unit: "bpm",
    icon: Heart,
    color: "#a9786b",
  },
};
async function api(url: string, body?: unknown, method?: string) {
  const r = await fetch("/api" + url, {
    method: method || (body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
function download(name: string, data: string) {
  const a = document.createElement("a");
  a.href = data;
  a.download = name;
  a.click();
}
function fuzzy(value: string, query: string) {
  const hay = value.toLowerCase();
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .every(
      (w) =>
        hay.includes(w) ||
        (w.length >= 4 &&
          hay.split(/\W+/).some((c) => {
            if (Math.abs(c.length - w.length) > 1) return false;
            let d = Array.from({ length: w.length + 1 }, (_, i) => i);
            for (let j = 1; j <= c.length; j++) {
              let p = d[0];
              d[0] = j;
              for (let i = 1; i <= w.length; i++) {
                let o = d[i];
                d[i] = Math.min(
                  d[i] + 1,
                  d[i - 1] + 1,
                  p + (w[i - 1] === c[j - 1] ? 0 : 1),
                );
                p = o;
              }
            }
            return d[w.length] <= 1;
          })),
    );
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,a[href],[tabindex="0"]',
        ) || [],
      ).filter((e) => !(e as HTMLButtonElement).disabled);
    focusable()[0]?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = focusable(),
          first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", listener);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        ref={ref}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">YOUR HEALTH, YOUR CONTROL</span>
            <h2 id="dialog-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={"field " + (wide ? "span-2" : "")}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({
  icon: Icon = FileText,
  title,
  text,
  action,
}: {
  icon?: typeof Heart;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function RecordIcon({ type }: { type: string }) {
  const Icon =
    type === "Lab result"
      ? FlaskConical
      : type === "Visit summary"
        ? Stethoscope
        : type === "Prescription"
          ? FileHeart
          : type === "Allergy"
            ? Shield
            : FileText;
  return (
    <span className={"record-icon " + type.toLowerCase().split(" ")[0]}>
      <Icon size={19} />
    </span>
  );
}
function App() {
  const [state, setState] = useState<State | null>(null),
    [demo, setDemo] = useState(false),
    [loading, setLoading] = useState(true),
    [fatal, setFatal] = useState(""),
    [page, setPage] = useState("Overview"),
    [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState(""),
    [type, setType] = useState("All records"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [showFilters, setShowFilters] = useState(false);
  const [modal, setModal] = useState(""),
    [record, setRecord] = useState<HealthRecord | null>(null),
    [metric, setMetric] = useState<MetricKey>("systolic"),
    [range, setRange] = useState(30),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [shareUrl, setShareUrl] = useState("");
  const [services, setServices] = useState({ sms: false, hospital: false }),
    [activityQuery, setActivityQuery] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const notify = (text: string) => {
    setToast(text);
  };
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const load = async () => {
    try {
      const d = await api("/state");
      setState(d.state);
      setDemo(d.demo);
      setServices(d.services);
      setFatal("");
    } catch (e) {
      if ((e as Error).message.includes("sign in")) setState(null);
      else setFatal((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const open = (name: string) => {
    setError("");
    setModal(name);
    if (name === "history")
      api("/history")
        .then(() => load())
        .catch((e) => setError(e.message));
  };
  const close = () => {
    setModal("");
    setError("");
    setShareUrl("");
  };
  const mutate = async (
    url: string,
    body: unknown,
    method = "POST",
    success?: string,
  ) => {
    setBusy(true);
    setError("");
    try {
      const d = await api(url, body, method);
      if (d.state) setState(d.state);
      if (success) notify(success);
      return d;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const go = (p: string) => {
    setPage(p);
    setMobile(false);
    setQuery("");
    if (p === "Access activity" || p === "Care & sharing") load();
  };
  const viewRecord = async (r: HealthRecord) => {
    setRecord(r);
    open("view");
    try {
      const d = await api(`/records/${r.id}/view`, {});
      setState(d.state);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const exportData = async () => {
    try {
      const d = await api("/export");
      const blob = URL.createObjectURL(
        new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }),
      );
      download(`folio-health-${today()}.json`, blob);
      setTimeout(() => URL.revokeObjectURL(blob), 1000);
      notify("Your complete archive has been downloaded.");
      load();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const importData = async (file: File) => {
    try {
      if (file.size > 8 * 1024 * 1024)
        throw new Error("Choose a FHIR JSON file smaller than 8 MB.");
      const data = JSON.parse(await file.text());
      const d = await mutate("/import", data);
      notify(`${d.count} hospital records imported and organized.`);
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (location.pathname.startsWith("/share/"))
    return <SharedView token={location.pathname.split("/")[2]} />;
  if (loading)
    return (
      <div className="loading">
        <Logo />
        <p>Opening your health workspace…</p>
      </div>
    );
  if (fatal)
    return (
      <div className="loading">
        <Logo />
        <h2>We couldn’t open your workspace</h2>
        <p>{fatal}</p>
        <button className="primary" onClick={load}>
          Try again
        </button>
      </div>
    );
  if (!state) return <Login onLogin={load} />;
  const latest = state.metrics.at(-1),
    previous = state.metrics.at(-2);
  const activeGrants = state.grants.filter(
    (g) => !g.revoked && Date.parse(g.expires) > Date.now(),
  );
  const filtered = state.records.filter(
    (r) =>
      fuzzy(
        `${r.title} ${r.type} ${r.provider} ${r.condition} ${r.notes}`,
        query,
      ) &&
      (type === "All records" || type === r.type) &&
      (!from || r.date >= from) &&
      (!to || r.date <= to),
  );
  const alerts = latest
    ? (Object.keys(metricInfo) as MetricKey[]).filter(
        (k) =>
          latest[k] < state.targets[k].min || latest[k] > state.targets[k].max,
      )
    : [];
  const nav = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Health records", icon: ClipboardList },
    { label: "Health trends", icon: Activity },
    { label: "Care & sharing", icon: UsersRound },
    { label: "Access activity", icon: History },
  ];
  const table = (rows: HealthRecord[], compact = false) => (
    <div className="table-scroll">
      <table className="records-table">
        <thead>
          <tr>
            <th>Record name</th>
            <th>Date</th>
            <th>Type</th>
            {!compact && <th>Provider</th>}
            <th>
              <span className="sr-only">Open record</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <button className="record-title" onClick={() => viewRecord(r)}>
                  <RecordIcon type={r.type} />
                  <span>
                    <strong>{r.title}</strong>
                    <small>
                      {compact
                        ? r.provider
                        : r.condition || "Personal health record"}
                    </small>
                  </span>
                </button>
              </td>
              <td className="nowrap">{shortDate(r.date)}</td>
              <td>
                <span className={"tag " + r.type.split(" ")[0].toLowerCase()}>
                  {r.type}
                </span>
              </td>
              {!compact && <td>{r.provider || "Self-reported"}</td>}
              <td>
                <button
                  aria-label={`Open ${r.title}`}
                  className="icon-button"
                  onClick={() => viewRecord(r)}
                >
                  <ChevronRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <Empty
          title="No records found"
          text="Add a record or try a different search."
          action={
            <button
              className="text-button"
              onClick={() => {
                setQuery("");
                setType("All records");
                setFrom("");
                setTo("");
              }}
            >
              Clear filters <ArrowRight size={15} />
            </button>
          }
        />
      )}
    </div>
  );
  const chart = (
    <section className="panel trend-panel">
      <div className="panel-head">
        <div>
          <h3>Health at a glance</h3>
          <p>Your measurements, over time.</p>
        </div>
        <div className="segmented" aria-label="Chart date range">
          {[7, 30, 90].map((n) => (
            <button
              className={range === n ? "selected" : ""}
              key={n}
              onClick={() => setRange(n)}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>
      <div className="chart-tabs">
        {(Object.keys(metricInfo) as MetricKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setMetric(k)}
            className={metric === k ? "selected" : ""}
          >
            {metricInfo[k].label.replace("Resting ", "")}
          </button>
        ))}
      </div>
      <div className="chart-meta">
        <span>
          <i className="dot teal" />
          {metric === "systolic" ? "Systolic" : metricInfo[metric].label}
        </span>
        {metric === "systolic" && (
          <span>
            <i className="dot pale" />
            Diastolic
          </span>
        )}
        <span className="chart-unit">{metricInfo[metric].unit}</span>
      </div>
      {state.metrics.length ? (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={state.metrics.filter(
                (m) =>
                  m.date >=
                  new Date(Date.now() - (range - 1) * 86400000)
                    .toISOString()
                    .slice(0, 10),
              )}
              margin={{ top: 10, right: 12, left: -28, bottom: 0 }}
            >
              <defs>
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#518e81" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#518e81" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="#e9eeea"
                vertical={false}
                strokeDasharray="3 4"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(d) =>
                  new Date(d + "T12:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                }
                axisLine={false}
                tickLine={false}
                minTickGap={45}
                tick={{ fontSize: 11, fill: "#8b9690" }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#8b9690" }}
                domain={["auto", "auto"]}
              />
              <Tooltip
                labelFormatter={(d) => shortDate(String(d))}
                contentStyle={{
                  border: "1px solid #e0e7df",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey={metric}
                name={
                  metric === "systolic" ? "Systolic" : metricInfo[metric].label
                }
                stroke="#34796e"
                strokeWidth={2.5}
                fill="url(#areaFill)"
                activeDot={{ r: 5, strokeWidth: 3, stroke: "#fff" }}
              />
              {metric === "systolic" && (
                <Area
                  type="monotone"
                  name="Diastolic"
                  dataKey="diastolic"
                  stroke="#b5c9a6"
                  strokeWidth={2}
                  fill="none"
                  strokeDasharray="5 4"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Empty
          icon={TrendingUp}
          title="A little data. A clearer picture."
          text="Log your first measurements to start your trend chart."
        />
      )}
      <div className="chart-footer">
        <span>
          <span className="dot light" />
          Personal range: {state.targets[metric].min}–
          {state.targets[metric].max} {metricInfo[metric].unit}
        </span>
        <button className="text-button subtle" onClick={() => open("targets")}>
          Edit range <SlidersHorizontal size={13} />
        </button>
      </div>
    </section>
  );
  return (
    <div className="app-shell">
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
        <Logo />
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={"nav-item " + (page === label ? "active" : "")}
              onClick={() => go(label)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {label === "Health records" && (
                <small>{state.records.length}</small>
              )}
              {page === label && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-mini">
            <span className="mini-shield">
              <ShieldCheck size={19} />
            </span>
            <strong>Personal by design.</strong>
            <p>
              You decide who sees
              <br />
              your health story.
            </p>
            <button
              className="text-button"
              onClick={() => go("Care & sharing")}
            >
              Manage privacy <ArrowRight size={14} />
            </button>
          </div>
          <button
            className={"nav-item " + (page === "Settings" ? "active" : "")}
            onClick={() => go("Settings")}
          >
            <Settings2 size={19} />
            Settings
          </button>
          <button className="nav-item" onClick={() => open("help")}>
            <CircleHelp size={19} />
            Help & support
          </button>
          <div className="sidebar-account">
            <button className="profile-button" onClick={() => open("profile")}>
              <span className="avatar">{initials(state.profile.name)}</span>
              <span>
                <strong>{state.profile.name}</strong>
                <small>{demo ? "Demo workspace" : "Personal account"}</small>
              </span>
            </button>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                await api("/logout", {});
                setState(null);
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>My workspace</span>
            <ChevronRight size={13} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={16} />
              <input
                aria-label="Search health records"
                placeholder="Search your records…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage("Health records");
                }}
              />
              <kbd>⌕</kbd>
            </label>
            <button
              className="notification-button icon-button"
              aria-label="Notifications"
              onClick={() => open("notifications")}
            >
              <Bell size={19} />
              {alerts.length > 0 && <i />}
            </button>
            <span className="header-divider" />
            <button
              className="avatar small"
              aria-label="Edit profile"
              onClick={() => open("profile")}
            >
              {initials(state.profile.name)}
            </button>
          </div>
        </header>
        <main>
          <div className="page-intro">
            <div>
              <div className="eyebrow">
                {page === "Overview"
                  ? "A LITTLE CLARITY, EVERY DAY"
                  : "YOUR PERSONAL HEALTH WORKSPACE"}
              </div>
              <h1>
                {page === "Overview"
                  ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${state.profile.name.split(" ")[0]}.`
                  : page}
              </h1>
              <p>
                {page === "Overview"
                  ? "Your health story, all in one place."
                  : page === "Health records"
                    ? "Every report, visit, and detail. Thoughtfully organized."
                    : page === "Health trends"
                      ? "Make sense of your measurements, one day at a time."
                      : page === "Care & sharing"
                        ? "The right information. The right people. On your terms."
                        : page === "Access activity"
                          ? "A transparent record of who accessed your health information."
                          : "A workspace that feels like yours."}
              </p>
            </div>
            <div className="intro-actions">
              {page === "Overview" && (
                <span className="today">
                  <CalendarDays size={15} />
                  {new Date().toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
              {["Overview", "Health records"].includes(page) ? (
                <button
                  className="primary"
                  onClick={() => {
                    setRecord(null);
                    open("record");
                  }}
                >
                  <Plus size={17} />
                  Add record
                </button>
              ) : page === "Health trends" ? (
                <button className="primary" onClick={() => open("metric")}>
                  <Plus size={17} />
                  Log measurements
                </button>
              ) : page === "Care & sharing" ? (
                <button className="primary" onClick={() => open("grant")}>
                  <Plus size={17} />
                  Grant access
                </button>
              ) : page === "Access activity" ? (
                <button className="secondary" onClick={exportData}>
                  <ArrowDownToLine size={16} />
                  Export archive
                </button>
              ) : null}
            </div>
          </div>
          {demo && (
            <div className="demo-note">
              <span className="dot amber" />
              You're exploring a demo with sample health data.
              <button
                onClick={async () => {
                  await api("/logout", {});
                  setState(null);
                }}
              >
                Create your own workspace <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {page === "Overview" && (
            <>
              <section className="welcome-banner">
                <div className="welcome-content">
                  <div className="banner-label">
                    <span className="dot teal" />
                    YOUR HEALTH, IN PERSPECTIVE
                  </div>
                  <h2>
                    A clearer picture.
                    <br />A little more peace of mind.
                  </h2>
                  <p>
                    Your records, insights, and care team — connected
                    <br className="desktop-break" /> in one personal space, with
                    you in control.
                  </p>
                  <button
                    className="banner-link"
                    onClick={() => open("profile")}
                  >
                    View my health profile <ArrowRight size={16} />
                  </button>
                </div>
                <div className="banner-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="orbit orbit-three" />
                  <div className="art-label label-one">
                    <span className="art-symbol">
                      <Heart size={16} />
                    </span>
                    Made for your wellbeing
                  </div>
                  <div className="health-emblem">
                    <div>
                      <HeartPulse size={47} strokeWidth={1.25} />
                    </div>
                  </div>
                  <div className="art-label label-two">
                    <ShieldCheck size={15} />
                    Always in your hands
                  </div>
                  <span className="art-dot one" />
                  <span className="art-dot two" />
                  <span className="art-spark">✧</span>
                </div>
              </section>
              <div className="section-label">
                <h2>Your latest measurements</h2>
                <button className="text-button" onClick={() => open("metric")}>
                  <Plus size={14} />
                  Log measurements
                </button>
              </div>
              <div className="metric-grid">
                {(Object.keys(metricInfo) as MetricKey[]).map((k) => {
                  const info = metricInfo[k],
                    Icon = info.icon,
                    delta = latest && previous ? latest[k] - previous[k] : 0;
                  return (
                    <button
                      key={k}
                      className={
                        "metric-card " + (metric === k ? "metric-selected" : "")
                      }
                      onClick={() => {
                        setMetric(k);
                        document.querySelector(".trend-panel")?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }}
                    >
                      <div className="metric-top">
                        <span className={"metric-icon " + k}>
                          <Icon size={19} />
                        </span>
                        <span>{info.label}</span>
                        <ArrowUpRight size={16} />
                      </div>
                      <div className="metric-value">
                        {latest ? (
                          k === "systolic" ? (
                            <>
                              {latest.systolic}
                              <span className="slash">/</span>
                              {latest.diastolic}
                            </>
                          ) : (
                            latest[k]
                          )
                        ) : (
                          "—"
                        )}
                        <small>{info.unit}</small>
                        <svg
                          className="sparkline"
                          viewBox="0 0 110 36"
                          aria-hidden="true"
                        >
                          <polyline
                            points={state.metrics
                              .slice(-12)
                              .map(
                                (m, i) =>
                                  `${i * 10},${32 - (m[k] - (k === "systolic" ? 112 : k === "glucose" ? 80 : 58))}`,
                              )
                              .join(" ")}
                            fill="none"
                            stroke={info.color}
                            strokeWidth="1.6"
                          />
                        </svg>
                      </div>
                      <div className="metric-foot">
                        <span
                          className={
                            "status " + (alerts.includes(k) ? "attention" : "")
                          }
                        >
                          <span className="dot" />
                          {!latest
                            ? "No readings"
                            : alerts.includes(k)
                              ? "Outside personal range"
                              : "Within personal range"}
                        </span>
                        <small>
                          {latest
                            ? shortDate(latest.date).replace(/, \d{4}/, "")
                            : "Get started"}
                        </small>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="dashboard-grid">
                {chart}
                <section className="panel care-panel">
                  <div className="panel-head">
                    <h3>Your care circle</h3>
                    <span className="count-badge">{activeGrants.length}</span>
                  </div>
                  <p className="panel-description">
                    A little support goes a long way.
                  </p>
                  {activeGrants.slice(0, 2).map((g) => (
                    <div className="care-person" key={g.id}>
                      <span className="doctor-avatar">
                        <Stethoscope size={23} />
                      </span>
                      <div>
                        <strong>{g.recipient}</strong>
                        <small>{g.role}</small>
                        <span className="tiny-status">
                          <i className="dot teal" />
                          Access active
                        </span>
                      </div>
                    </div>
                  ))}
                  {!activeGrants.length && (
                    <p className="muted">You haven't shared any records yet.</p>
                  )}
                  <div className="care-access">
                    <LockKeyhole size={15} />
                    <span>
                      Only the records you choose.
                      <br />
                      <strong>Only for as long as you allow.</strong>
                    </span>
                  </div>
                  <button
                    className="secondary full"
                    onClick={() => go("Care & sharing")}
                  >
                    Manage access <ArrowRight size={15} />
                  </button>
                  <div className="care-tip">
                    <span className="tip-icon">
                      <Sparkles size={19} />
                    </span>
                    <h4>Small steps, better context.</h4>
                    <p>
                      {alerts.length
                        ? "A recent reading is outside your personal range. Review it with your care team."
                        : "Consistent measurements can help you and your care team see patterns over time."}
                    </p>
                    <button
                      className="text-button"
                      onClick={() => go("Health trends")}
                    >
                      Explore your trends <ArrowRight size={14} />
                    </button>
                  </div>
                </section>
              </div>
              <section className="panel recent-records">
                <div className="panel-head">
                  <div className="inline-heading">
                    <h3>Recent health records</h3>
                    <span className="count-badge">{state.records.length}</span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => go("Health records")}
                  >
                    View all records <ArrowRight size={15} />
                  </button>
                </div>
                {table(state.records.slice(0, 3), true)}
              </section>
              <div className="footer-note">
                <ShieldCheck size={15} />
                <span>
                  Your health is personal. Your information should stay that
                  way.
                </span>
                <button onClick={() => go("Access activity")}>
                  View access activity <ArrowRight size={13} />
                </button>
              </div>
            </>
          )}
          {page === "Health records" && (
            <>
              <div className="records-toolbar">
                <div className="record-tabs">
                  {[
                    "All records",
                    "Lab result",
                    "Visit summary",
                    "Prescription",
                    "Imaging",
                    "Allergy",
                  ].map((t) => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={type === t ? "selected" : ""}
                    >
                      {t === "All records" ? (
                        <>
                          All records <span>{state.records.length}</span>
                        </>
                      ) : (
                        t
                      )}
                    </button>
                  ))}
                </div>
                <div className="toolbar-actions">
                  <button
                    className={"secondary " + (showFilters ? "pressed" : "")}
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <SlidersHorizontal size={15} />
                    Filters
                  </button>
                  <button className="secondary" onClick={() => open("import")}>
                    <CloudDownload size={16} />
                    Import
                  </button>
                </div>
              </div>
              {showFilters && (
                <div className="filter-panel">
                  <Field label="Search by title, disease, or notes">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Fuzzy search supported"
                    />
                  </Field>
                  <Field label="From">
                    <input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </Field>
                  <Field label="To">
                    <input
                      type="date"
                      min={from}
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </Field>
                  <button
                    className="text-button"
                    onClick={() => {
                      setQuery("");
                      setType("All records");
                      setFrom("");
                      setTo("");
                    }}
                  >
                    Reset
                  </button>
                </div>
              )}
              <section className="panel">
                <div className="panel-head">
                  <h3>Your document library</h3>
                  <span className="muted small-text">
                    {filtered.length} records · Newest first
                  </span>
                </div>
                {table(filtered)}
              </section>
              <div className="import-banner">
                <span className="import-icon">
                  <Hospital size={25} />
                </span>
                <div>
                  <h3>Less paperwork. More perspective.</h3>
                  <p>
                    Import hospital records from a FHIR file, or sync with a
                    connected provider.
                  </p>
                </div>
                <button className="secondary" onClick={() => open("import")}>
                  Connect your records <ArrowRight size={15} />
                </button>
              </div>
              <button
                className="text-button history-link"
                onClick={() => open("history")}
              >
                <History size={16} />
                View revision history
              </button>
            </>
          )}
          {page === "Health trends" && (
            <>
              <div className="trends-page">
                {chart}
                <section className="panel insights">
                  <div className="panel-head">
                    <h3>Insights for your next visit</h3>
                    <Sparkles size={20} />
                  </div>
                  <div className="insight-item">
                    <span className="insight-number">01</span>
                    <div>
                      <h4>
                        {!latest
                          ? "Start with your first reading"
                          : alerts.length
                            ? "A reading to follow up on"
                            : "Keep the bigger picture in view"}
                      </h4>
                      <p>
                        {!latest
                          ? "Log a measurement to compare it with your personal ranges and start seeing changes over time."
                          : alerts.length
                            ? `${alerts.map((k) => metricInfo[k].label).join(" and ")} is outside your saved personal range. Review the reading and your range with your clinician.`
                            : "Your most recent readings are within your saved ranges. Patterns over time are more useful than a single measurement."}
                      </p>
                    </div>
                  </div>
                  <div className="insight-item">
                    <span className="insight-number">02</span>
                    <div>
                      <h4>Bring your history into the conversation</h4>
                      <p>
                        {state.profile.familyHistory
                          ? `Your profile includes family history: ${state.profile.familyHistory}. You can share this context directly with your care team.`
                          : "Add your family history and past conditions to give your care team useful context."}
                      </p>
                      <button
                        className="text-button"
                        onClick={() => open("profile")}
                      >
                        Review my profile <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="clinical-note">
                    These are comparisons with your saved ranges, not a
                    diagnosis or a clinical risk score. Ask your care team to
                    set ranges appropriate for you.
                    {demo
                      ? " Current ranges and readings are illustrative."
                      : ""}
                  </p>
                </section>
              </div>
              <section className="panel">
                <div className="panel-head">
                  <h3>Measurement history</h3>
                  <button
                    className="text-button"
                    onClick={() => open("metric")}
                  >
                    <Plus size={15} />
                    Add reading
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Blood pressure</th>
                        <th>Blood glucose</th>
                        <th>Heart rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...state.metrics].reverse().map((m) => (
                        <tr key={m.id}>
                          <td>{shortDate(m.date)}</td>
                          <td>
                            {m.systolic}/{m.diastolic} <small>mmHg</small>
                          </td>
                          <td>
                            {m.glucose} <small>mg/dL</small>
                          </td>
                          <td>
                            {m.heartRate} <small>bpm</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!state.metrics.length && (
                  <Empty
                    title="Your first reading starts here"
                    text="Log blood pressure, glucose, and heart rate above."
                  />
                )}
              </section>
            </>
          )}
          {page === "Care & sharing" && (
            <>
              <div className="privacy-heading">
                <span>
                  <ShieldCheck size={26} />
                </span>
                <div>
                  <h3>You're in control of every connection.</h3>
                  <p>
                    Choose records, set an expiration, and revoke access at any
                    time.
                  </p>
                </div>
              </div>
              <div className="sharing-grid">
                {state.grants.map((g) => {
                  const active =
                    !g.revoked && Date.parse(g.expires) > Date.now();
                  return (
                    <section
                      className={
                        "panel grant-card " + (!active ? "inactive" : "")
                      }
                      key={g.id}
                    >
                      <div className="grant-person">
                        <span className="doctor-avatar">
                          <Stethoscope size={22} />
                        </span>
                        <div>
                          <h3>{g.recipient}</h3>
                          <p>{g.email}</p>
                        </div>
                        <span
                          className={"status " + (!active ? "neutral" : "")}
                        >
                          <i className="dot" />
                          {active
                            ? "Active"
                            : g.revoked
                              ? "Revoked"
                              : "Expired"}
                        </span>
                      </div>
                      <div className="grant-details">
                        <span>Shared records</span>
                        <div>
                          {g.types.map((t) => (
                            <span className="tag" key={t}>
                              {t}
                            </span>
                          ))}
                        </div>
                        <span>Record period</span>
                        <strong>
                          {shortDate(g.from)} – {shortDate(g.to)}
                        </strong>
                        <span>Permission</span>
                        <strong>
                          {g.editable ? "View and edit notes" : "View only"}
                          {g.lockAllergies ? " · Allergy edits locked" : ""}
                        </strong>
                        <span>Expires</span>
                        <strong>{shortTime(g.expires)}</strong>
                      </div>
                      <div className="grant-footer">
                        <span>
                          <LockKeyhole size={14} />
                          Time-limited access
                        </span>
                        {active && (
                          <button
                            className="danger-text"
                            onClick={() => {
                              setShareUrl(g.id);
                              open("revoke");
                            }}
                          >
                            Revoke access
                          </button>
                        )}
                      </div>
                    </section>
                  );
                })}
                <button className="add-grant" onClick={() => open("grant")}>
                  <span>
                    <Plus size={24} />
                  </span>
                  <h3>Invite someone to your care circle</h3>
                  <p>Share just what they need to know.</p>
                </button>
              </div>
              <div className="privacy-explainer">
                <LockKeyhole size={21} />
                <div>
                  <h3>Sensitive details stay protected.</h3>
                  <p>
                    Allergy records are locked against edits by default. Sharing
                    links grant access to anyone who has the link, so share them
                    privately with the intended recipient.
                  </p>
                </div>
              </div>
            </>
          )}
          {page === "Access activity" && (
            <>
              <div className="activity-summary">
                <div>
                  <ShieldCheck size={22} />
                  <span>
                    <strong>{state.logs.length}</strong> recorded actions
                  </span>
                </div>
                <div>
                  <UsersRound size={22} />
                  <span>
                    <strong>
                      {new Set(state.logs.map((l) => l.actor)).size}
                    </strong>{" "}
                    actors
                  </span>
                </div>
                <div>
                  <Clock3 size={22} />
                  <span>
                    Latest activity{" "}
                    <strong>
                      {state.logs[0]
                        ? shortTime(state.logs[0].timestamp)
                        : "No activity"}
                    </strong>
                  </span>
                </div>
              </div>
              <section className="panel">
                <div className="panel-head">
                  <h3>Activity log</h3>
                  <label className="inline-search">
                    <Search size={16} />
                    <input
                      aria-label="Filter activity"
                      value={activityQuery}
                      onChange={(e) => setActivityQuery(e.target.value)}
                      placeholder="Search activity…"
                    />
                  </label>
                </div>
                <div className="table-scroll">
                  <table className="activity-table">
                    <thead>
                      <tr>
                        <th>Who & what</th>
                        <th>Details</th>
                        <th>Time</th>
                        <th>Access location / IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.logs
                        .filter((l) =>
                          fuzzy(
                            `${l.actor} ${l.action} ${l.detail} ${l.location}`,
                            activityQuery,
                          ),
                        )
                        .map((l) => (
                          <tr key={l.id}>
                            <td>
                              <div className="actor">
                                <span className="log-icon">
                                  {l.action === "Viewed" ? (
                                    <BookOpen size={16} />
                                  ) : l.action === "Revoked" ? (
                                    <LockKeyhole size={16} />
                                  ) : (
                                    <CheckCheck size={16} />
                                  )}
                                </span>
                                <div>
                                  <strong>{l.actor}</strong>
                                  <small>{l.action}</small>
                                </div>
                              </div>
                            </td>
                            <td>{l.detail}</td>
                            <td className="nowrap">{shortTime(l.timestamp)}</td>
                            <td>
                              <span className="location-badge">
                                {l.location === "127.0.0.1" ||
                                l.location === "::ffff:127.0.0.1"
                                  ? "This device (localhost)"
                                  : l.location}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <p className="under-note">
                The log records server-observed activity and IP addresses. A
                sharing-link label identifies the intended recipient, not a
                verified identity.
              </p>
            </>
          )}
          {page === "Settings" && (
            <div className="settings-grid">
              <section className="panel settings-panel">
                <div className="panel-head">
                  <h3>Your profile</h3>
                  <UserRound size={20} />
                </div>
                <div className="settings-profile">
                  <span className="avatar large">
                    {initials(state.profile.name)}
                  </span>
                  <h2>{state.profile.name}</h2>
                  <p>{state.profile.email}</p>
                </div>
                <button
                  className="secondary full"
                  onClick={() => open("profile")}
                >
                  Edit personal & medical information <ArrowRight size={15} />
                </button>
              </section>
              <section className="panel settings-panel">
                <div className="panel-head">
                  <h3>Sign-in & security</h3>
                  <ShieldCheck size={20} />
                </div>
                <div className="setting-row">
                  <span className="setting-icon">
                    <LockKeyhole size={20} />
                  </span>
                  <div>
                    <strong>Password</strong>
                    <p>Salted and hashed. Sessions expire after 8 hours.</p>
                  </div>
                  <span className="status">Enabled</span>
                </div>
                <div className="setting-row">
                  <span className="setting-icon">
                    <Fingerprint size={20} />
                  </span>
                  <div>
                    <strong>Device passkey</strong>
                    <p>
                      Use face, fingerprint, or device PIN, depending on your
                      device.
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        const options = await api("/passkeys/register/options");
                        const result = await startRegistration({
                          optionsJSON: options,
                        });
                        await mutate(
                          "/passkeys/register/verify",
                          result,
                          "POST",
                          "Device passkey added.",
                        );
                      } catch (e) {
                        notify((e as Error).message);
                      }
                    }}
                  >
                    {state.passkeys.length ? "Add another" : "Set up"}
                  </button>
                </div>
                <div className="setting-row">
                  <span className="setting-icon">
                    <Smartphone size={20} />
                  </span>
                  <div>
                    <strong>SMS verification</strong>
                    <p>
                      {services.sms
                        ? "Provider connected. Set your phone number in your profile."
                        : "A Twilio Verify connection is needed to send sign-in codes."}
                    </p>
                  </div>
                  <span className="status neutral">
                    {services.sms ? "Connected" : "Not connected"}
                  </span>
                </div>
              </section>
              <section className="panel settings-panel">
                <div className="panel-head">
                  <h3>Data & preferences</h3>
                  <Settings2 size={20} />
                </div>
                <div className="setting-row">
                  <span className="setting-icon">
                    <ArrowDownToLine size={20} />
                  </span>
                  <div>
                    <strong>Take your records with you</strong>
                    <p>
                      Download records, measurements, revisions, and access
                      logs.
                    </p>
                  </div>
                  <button className="secondary" onClick={exportData}>
                    Export
                  </button>
                </div>
                <div className="setting-row">
                  <span className="setting-icon">
                    <UsersRound size={20} />
                  </span>
                  <div>
                    <strong>Peer community</strong>
                    <p>
                      The optional community module is not enabled in this
                      edition. No health information is shared socially.
                    </p>
                  </div>
                  <span className="status neutral">Off</span>
                </div>
                <div className="setting-row">
                  <span className="setting-icon">
                    <History size={20} />
                  </span>
                  <div>
                    <strong>Revision history</strong>
                    <p>
                      See what changed in your records and personal profile.
                    </p>
                  </div>
                  <button className="secondary" onClick={() => open("history")}>
                    View history
                  </button>
                </div>
              </section>
              <section className="panel settings-panel storage-panel">
                <ShieldCheck size={30} />
                <h3>A home for your health story.</h3>
                <p>
                  Records and access logs are stored in an encrypted local
                  database. Keep the database and encryption key together when
                  backing up this workspace.
                </p>
                <span className="small-text muted">
                  Local edition · Folio 1.0
                </span>
              </section>
            </div>
          )}
          <footer className="app-footer">
            <span>
              folio<span className="footer-plus">+</span>
            </span>
            <p>A little more clarity. A little more you.</p>
            <small>PERSONAL HEALTH WORKSPACE</small>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            {
              record: record ? "Edit health record" : "Add a health record",
              view: record?.title || "Health record",
              profile: "Your health profile",
              metric: "Log your measurements",
              targets: "Personal reference ranges",
              grant: "Share with your care team",
              revoke: "Revoke this authorization?",
              import: "Connect your health records",
              history: "Your revision history",
              help: "A little guidance",
              notifications: "Your notifications",
            }[modal] || ""
          }
          subtitle={
            modal === "record"
              ? "Keep the details that matter, in one place."
              : modal === "grant"
                ? "You choose what to share, and for how long."
                : undefined
          }
          onClose={close}
          wide={["profile", "history", "view"].includes(modal)}
        >
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {modal === "record" && (
            <RecordForm
              record={record}
              busy={busy}
              onCancel={close}
              onSave={async (b) => {
                try {
                  await mutate(
                    record ? `/records/${record.id}` : "/records",
                    b,
                    record ? "PUT" : "POST",
                    record
                      ? "Record updated. Previous version saved."
                      : "Your record has been added.",
                  );
                  close();
                } catch {}
              }}
            />
          )}
          {modal === "view" && record && (
            <>
              <div className="record-detail-meta">
                <span className="tag">{record.type}</span>
                <span>{shortDate(record.date)}</span>
                <span>Version {record.version}</span>
              </div>
              <dl className="record-dl">
                <div>
                  <dt>Provider</dt>
                  <dd>{record.provider || "Self-reported"}</dd>
                </div>
                <div>
                  <dt>Condition / topic</dt>
                  <dd>{record.condition || "Not specified"}</dd>
                </div>
              </dl>
              <div className="record-notes">
                <span className="eyebrow">NOTES & DETAILS</span>
                <p>{record.notes || "No notes added."}</p>
              </div>
              {record.file && (
                <button
                  className="attachment"
                  onClick={() => download(record.file!.name, record.file!.data)}
                >
                  <FileText size={20} />
                  <span>{record.file.name}</span>
                  <ArrowDownToLine size={18} />
                </button>
              )}
              <div className="modal-actions">
                <button className="text-button" onClick={() => open("history")}>
                  <History size={16} />
                  Revision history
                </button>
                <button className="primary" onClick={() => open("record")}>
                  Edit record <ArrowRight size={15} />
                </button>
              </div>
            </>
          )}
          {modal === "profile" && (
            <ProfileForm
              profile={state.profile}
              busy={busy}
              onCancel={close}
              onSave={async (b) => {
                try {
                  await mutate(
                    "/profile",
                    b,
                    "PUT",
                    "Your health profile is up to date.",
                  );
                  close();
                } catch {}
              }}
            />
          )}
          {modal === "metric" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const b = Object.fromEntries(new FormData(e.currentTarget));
                try {
                  await mutate(
                    "/metrics",
                    b,
                    "POST",
                    "Measurements saved. Your trends have been updated.",
                  );
                  close();
                } catch {}
              }}
            >
              <p className="form-description">
                Add readings from your own device or a clinical visit.
              </p>
              <div className="form-grid">
                <Field label="Date" wide>
                  <input
                    name="date"
                    type="date"
                    max={today()}
                    defaultValue={today()}
                    required
                  />
                </Field>
                {[
                  ["systolic", "Systolic pressure (mmHg)", latest?.systolic],
                  ["diastolic", "Diastolic pressure (mmHg)", latest?.diastolic],
                  ["glucose", "Blood glucose (mg/dL)", latest?.glucose],
                  ["heartRate", "Resting heart rate (bpm)", latest?.heartRate],
                ].map(([name, label, value]) => (
                  <Field key={name} label={String(label)}>
                    <input
                      name={String(name)}
                      type="number"
                      min="1"
                      max="999"
                      step="0.1"
                      placeholder={String(value || "")}
                      required
                    />
                  </Field>
                ))}
              </div>
              <FormActions
                busy={busy}
                onCancel={close}
                label="Save measurements"
              />
            </form>
          )}
          {modal === "targets" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  b = Object.fromEntries(
                    (Object.keys(metricInfo) as MetricKey[]).map((k) => [
                      k,
                      {
                        min: Number(f.get(k + "Min")),
                        max: Number(f.get(k + "Max")),
                      },
                    ]),
                  );
                try {
                  await mutate(
                    "/targets",
                    b,
                    "PUT",
                    "Personal ranges updated.",
                  );
                  close();
                } catch {}
              }}
            >
              <p className="form-description">
                Use ranges agreed with your care team. The starting values are
                illustrative and are not personalized medical recommendations.
              </p>
              {(Object.keys(metricInfo) as MetricKey[]).map((k) => (
                <div className="range-row" key={k}>
                  <strong>
                    {metricInfo[k].label}
                    <small>{metricInfo[k].unit}</small>
                  </strong>
                  <Field label="Lower">
                    <input
                      name={k + "Min"}
                      type="number"
                      min="0"
                      required
                      defaultValue={state.targets[k].min}
                    />
                  </Field>
                  <Field label="Upper">
                    <input
                      name={k + "Max"}
                      type="number"
                      min="1"
                      required
                      defaultValue={state.targets[k].max}
                    />
                  </Field>
                </div>
              ))}
              <FormActions busy={busy} onCancel={close} label="Save ranges" />
            </form>
          )}
          {modal === "grant" &&
            (shareUrl ? (
              <div className="share-success">
                <span>
                  <Check size={28} />
                </span>
                <h3>Your sharing link is ready.</h3>
                <p>
                  Send this link privately to the intended recipient. Anyone
                  with the link can use the permissions you selected until it
                  expires or you revoke it.
                </p>
                <input
                  aria-label="Sharing link"
                  value={shareUrl}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="primary full"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(shareUrl);
                      notify("Sharing link copied.");
                    } catch {
                      notify("Select and copy the link above.");
                    }
                  }}
                >
                  <Link2 size={16} />
                  Copy sharing link
                </button>
              </div>
            ) : (
              <GrantForm
                busy={busy}
                onCancel={close}
                onSave={async (b) => {
                  try {
                    const d = await mutate("/grants", b);
                    setShareUrl(d.url);
                  } catch {}
                }}
              />
            ))}
          {modal === "revoke" && (
            <>
              <p className="form-description">
                The recipient’s sharing link will stop working immediately. Your
                records and the access log will be kept.
              </p>
              <div className="modal-actions">
                <button className="secondary" onClick={close}>
                  Keep access
                </button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await mutate(
                        `/grants/${shareUrl}/revoke`,
                        {},
                        "POST",
                        "Access revoked. The sharing link is no longer active.",
                      );
                      close();
                    } catch {}
                  }}
                >
                  Revoke access
                </button>
              </div>
            </>
          )}
          {modal === "import" && (
            <>
              <button
                className="import-drop"
                onClick={() => importRef.current?.click()}
                disabled={busy}
              >
                <span>
                  <Upload size={28} />
                </span>
                <h3>Import a hospital export</h3>
                <p>
                  Choose a FHIR Bundle (.json), up to 8 MB.
                  <br />
                  Reports are categorized and duplicates are skipped.
                </p>
                <span className="secondary">Choose file</span>
              </button>
              <input
                hidden
                ref={importRef}
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importData(f);
                  e.target.value = "";
                }}
              />
              <div className="divider-text">OR CONNECT DIRECTLY</div>
              <div className="provider-connect">
                <Hospital size={25} />
                <div>
                  <strong>Hospital FHIR connection</strong>
                  <p>
                    {services.hospital
                      ? "Your provider is configured. Import the latest records."
                      : "No hospital provider connected yet."}
                  </p>
                </div>
              </div>
              <button
                className="secondary full"
                disabled={!services.hospital || busy}
                onClick={async () => {
                  try {
                    const d = await mutate("/sync", {});
                    notify(`${d.count} records synced.`);
                    close();
                  } catch {}
                }}
              >
                Sync hospital records <CloudDownload size={16} />
              </button>
              <p className="under-note">
                Direct sync requires your hospital’s approved connection and an
                account-to-patient mapping. You can also add PDF reports using
                Add record.
              </p>
            </>
          )}
          {modal === "history" && (
            <div className="history-list">
              {state.history.length ? (
                state.history.map((h) => (
                  <div className="history-item" key={h.id}>
                    <span className="history-marker">
                      <History size={16} />
                    </span>
                    <div>
                      <h4>{h.title}</h4>
                      <p>{h.detail}</p>
                      <time>{shortTime(h.timestamp)}</time>
                      <details>
                        <summary>See saved changes</summary>
                        {!!h.before && (
                          <>
                            <strong>Before</strong>
                            <pre>
                              {JSON.stringify(
                                h.before,
                                (k, v) =>
                                  k === "file" && v ? { name: v.name } : v,
                                2,
                              )}
                            </pre>
                          </>
                        )}
                        <strong>After</strong>
                        <pre>
                          {JSON.stringify(
                            h.snapshot,
                            (k, v) =>
                              k === "file" && v ? { name: v.name } : v,
                            2,
                          )}
                        </pre>
                      </details>
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  icon={History}
                  title="A fresh start"
                  text="Changes to your profile and records will appear here."
                />
              )}
            </div>
          )}
          {modal === "notifications" && (
            <>
              {alerts.length ? (
                alerts.map((k) => (
                  <div className="notification-item" key={k}>
                    <Activity size={21} />
                    <div>
                      <h4>{metricInfo[k].label} outside your personal range</h4>
                      <p>
                        Your latest reading is {latest![k]} {metricInfo[k].unit}
                        . Your saved range is {state.targets[k].min}–
                        {state.targets[k].max}.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => {
                          go("Health trends");
                          setMetric(k);
                          close();
                        }}
                      >
                        Review trend <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  icon={CheckCheck}
                  title="You're all caught up"
                  text="No readings outside your saved ranges. This is not an assessment of your overall health."
                />
              )}
            </>
          )}
          {modal === "help" && (
            <div className="help-content">
              <h3>Your health story, step by step.</h3>
              <p>
                <strong>1. Make it yours.</strong> Add your personal details,
                family history, medications, and allergies to your profile.
              </p>
              <p>
                <strong>2. Keep everything together.</strong> Add records,
                upload reports, or import a hospital FHIR export. Search
                supports approximate spellings.
              </p>
              <p>
                <strong>3. See the patterns.</strong> Log measurements and set
                reference ranges with your care team.
              </p>
              <p>
                <strong>4. Share on your terms.</strong> Pick record types, a
                date range, and an expiry. Revoke access whenever you need.
              </p>
              <p>
                <strong>5. Stay informed.</strong> Review access activity and
                saved versions, or export your complete archive in Settings.
              </p>
              <div className="help-note">
                This local app supports organizing health information. It does
                not provide diagnoses, prescriptions, or emergency services.
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark">
        <Plus size={23} strokeWidth={1.6} />
      </span>
      <span>
        folio<span className="logo-period">.</span>
      </span>
    </div>
  );
}
function FormActions({
  busy,
  onCancel,
  label,
}: {
  busy: boolean;
  onCancel: () => void;
  label: string;
}) {
  return (
    <div className="modal-actions">
      <button className="secondary" type="button" onClick={onCancel}>
        Cancel
      </button>
      <button className="primary" disabled={busy} type="submit">
        {busy ? "Saving…" : label}
        {!busy && <Check size={16} />}
      </button>
    </div>
  );
}
function RecordForm({
  record,
  onSave,
  onCancel,
  busy,
}: {
  record: HealthRecord | null;
  onSave: (b: unknown) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [file, setFile] = useState(record?.file || null),
    [fileError, setFileError] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...Object.fromEntries(new FormData(e.currentTarget)), file });
      }}
    >
      <div className="form-grid">
        <Field label="Record title" wide>
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={record?.title}
            placeholder="e.g. Annual health checkup"
          />
        </Field>
        <Field label="Record type">
          <select name="type" defaultValue={record?.type || "Lab result"}>
            {recordTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input
            name="date"
            type="date"
            required
            defaultValue={record?.date || today()}
          />
        </Field>
        <Field label="Provider">
          <input
            name="provider"
            maxLength={200}
            defaultValue={record?.provider}
            placeholder="Hospital or clinician"
          />
        </Field>
        <Field label="Condition / topic">
          <input
            name="condition"
            maxLength={200}
            defaultValue={record?.condition}
            placeholder="e.g. Routine screening"
          />
        </Field>
        <Field label="Notes & details" wide>
          <textarea
            name="notes"
            rows={4}
            maxLength={20000}
            defaultValue={record?.notes}
            placeholder="Add results, symptoms, or context you want to keep."
          />
        </Field>
        <Field label="Attach a report (PDF, PNG, JPEG · up to 5 MB)" wide>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (
                f.size > 5 * 1024 * 1024 ||
                !["application/pdf", "image/png", "image/jpeg"].includes(f.type)
              ) {
                setFileError("Choose a PDF, PNG, or JPEG smaller than 5 MB.");
                e.target.value = "";
                return;
              }
              setFileError("");
              const reader = new FileReader();
              reader.onload = () =>
                setFile({ name: f.name, data: String(reader.result) });
              reader.readAsDataURL(f);
            }}
          />
        </Field>
        {file && (
          <div className="attached-file span-2">
            <FileText size={16} />
            {file.name}
            <button
              type="button"
              className="icon-button"
              aria-label="Remove attachment"
              onClick={() => setFile(null)}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {fileError && <p className="form-error span-2">{fileError}</p>}
      </div>
      <FormActions
        busy={busy}
        onCancel={onCancel}
        label={record ? "Save changes" : "Add record"}
      />
    </form>
  );
}
function ProfileForm({
  profile,
  onSave,
  onCancel,
  busy,
}: {
  profile: Record<string, string>;
  onSave: (b: unknown) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(Object.fromEntries(new FormData(e.currentTarget)));
      }}
    >
      <div className="form-section-title">
        <UserRound size={16} />
        The essentials
      </div>
      <div className="form-grid">
        <Field label="Full name">
          <input
            name="name"
            defaultValue={profile.name}
            maxLength={100}
            required
          />
        </Field>
        <Field label="Date of birth">
          <input
            name="dob"
            type="date"
            max={today()}
            defaultValue={profile.dob}
          />
        </Field>
        <Field label="Blood type">
          <select name="bloodType" defaultValue={profile.bloodType}>
            <option value="">Not specified</option>
            {["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Phone (international format)">
          <input
            name="phone"
            type="tel"
            pattern="\+[1-9][0-9]{7,14}"
            placeholder="+14155550123"
            defaultValue={profile.phone}
          />
        </Field>
        <Field label="Emergency contact" wide>
          <input
            name="emergencyContact"
            defaultValue={profile.emergencyContact}
            maxLength={200}
          />
        </Field>
      </div>
      <div className="form-section-title">
        <HeartPulse size={16} />
        Your medical background
      </div>
      <div className="form-grid">
        {[
          ["conditions", "Past illnesses & current conditions"],
          ["familyHistory", "Family medical history"],
          ["medications", "Current & past medications"],
          ["allergies", "Allergies & reactions"],
        ].map(([key, label]) => (
          <Field key={key} label={label}>
            <textarea
              name={key}
              defaultValue={profile[key]}
              rows={3}
              maxLength={4000}
              placeholder="Add details when you're ready"
            />
          </Field>
        ))}
      </div>
      <p className="under-note">
        <LockKeyhole size={13} />
        Profile details are private. Sharing grants only include the record
        types you select.
      </p>
      <FormActions busy={busy} onCancel={onCancel} label="Save profile" />
    </form>
  );
}
function GrantForm({
  onSave,
  onCancel,
  busy,
}: {
  onSave: (b: unknown) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<RecordType[]>(["Lab result"]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave({
          ...Object.fromEntries(f),
          types: selected,
          editable: f.get("editable") === "on",
          lockAllergies: f.get("lockAllergies") === "on",
        });
      }}
    >
      <div className="form-grid">
        <Field label="Recipient name">
          <input
            name="recipient"
            required
            placeholder="Dr. Sarah Chen"
            maxLength={100}
          />
        </Field>
        <Field label="Email">
          <input
            name="email"
            type="email"
            required
            placeholder="doctor@clinic.com"
          />
        </Field>
        <Field label="Role" wide>
          <input
            name="role"
            placeholder="e.g. Primary care physician"
            maxLength={100}
          />
        </Field>
      </div>
      <div className="form-section-title">Which records can they access?</div>
      <div className="checkbox-options">
        {recordTypes.map((t) => (
          <label key={t}>
            <input
              type="checkbox"
              checked={selected.includes(t)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, t]
                    : selected.filter((x) => x !== t),
                )
              }
            />
            <span>{t}</span>
          </label>
        ))}
      </div>
      <div className="form-grid">
        <Field label="Record dates from">
          <input
            name="from"
            type="date"
            defaultValue={new Date(Date.now() - 365 * 86400000)
              .toISOString()
              .slice(0, 10)}
            required
          />
        </Field>
        <Field label="Through">
          <input name="to" type="date" defaultValue={today()} required />
        </Field>
        <Field label="Access expires after" wide>
          <select name="days">
            <option value="1">24 hours · One visit</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
        </Field>
      </div>
      <label className="checkbox-line">
        <input name="editable" type="checkbox" />
        Allow edits to record notes
      </label>
      <label className="checkbox-line">
        <input name="lockAllergies" type="checkbox" defaultChecked />
        Lock allergy records against edits
      </label>
      <p className="under-note">
        This creates a private access link. It does not send an email.
      </p>
      <FormActions
        busy={busy || !selected.length}
        onCancel={onCancel}
        label="Create sharing link"
      />
    </form>
  );
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState("login"),
    [method, setMethod] = useState("password"),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [requestId, setRequestId] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-page">
      <div className="auth-story">
        <Logo />
        <div>
          <span className="eyebrow">A SPACE FOR YOUR WELLBEING</span>
          <h1>
            Your health.
            <br />
            Your story.
            <br />
            <em>All together.</em>
          </h1>
          <p>
            A thoughtful home for your records,
            <br />
            your progress, and the people who care.
          </p>
          <div className="auth-emblem">
            <HeartPulse size={64} strokeWidth={1} />
          </div>
        </div>
        <span className="auth-footer">
          <ShieldCheck size={16} />
          Personal by design. Yours by choice.
        </span>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-form">
          <span className="eyebrow">WELCOME TO FOLIO</span>
          <h2>
            {mode === "register"
              ? "A fresh start for your health."
              : "A little clarity starts here."}
          </h2>
          <p>
            {mode === "register"
              ? "Create your personal health workspace."
              : "Sign in to your personal health workspace."}
          </p>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                if (method === "sms" && mode === "login") {
                  if (!requestId) {
                    const d = await api("/auth/sms/send", { email });
                    setRequestId(d.requestId);
                    return;
                  }
                  await api("/auth/sms/verify", {
                    requestId,
                    code: f.get("code"),
                  });
                } else
                  await api(
                    mode === "register" ? "/auth/register" : "/auth/login",
                    { email, password: f.get("password"), name: f.get("name") },
                  );
                onLogin();
              });
            }}
          >
            {mode === "register" && (
              <Field label="Full name">
                <input
                  name="name"
                  required
                  placeholder="Alex Morgan"
                  maxLength={100}
                />
              </Field>
            )}
            <Field label="Email address">
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setRequestId("");
                }}
                required
                placeholder="you@example.com"
              />
            </Field>
            {method === "password" || mode === "register" ? (
              <Field label="Password">
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  minLength={mode === "register" ? 12 : undefined}
                  maxLength={200}
                  required
                  placeholder={
                    mode === "register"
                      ? "At least 12 characters"
                      : "Enter your password"
                  }
                />
              </Field>
            ) : (
              requestId && (
                <Field label="SMS verification code">
                  <input
                    name="code"
                    inputMode="numeric"
                    pattern="[0-9]{4,8}"
                    required
                    autoComplete="one-time-code"
                    placeholder="Enter your code"
                  />
                </Field>
              )
            )}
            <button className="primary full" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "register"
                  ? "Create workspace"
                  : method === "sms" && !requestId
                    ? "Send verification code"
                    : "Sign in"}
              <ArrowRight size={16} />
            </button>
          </form>
          {mode === "login" && (
            <>
              <div className="auth-alternatives">
                <button
                  className="secondary"
                  onClick={() => {
                    setMethod(method === "password" ? "sms" : "password");
                    setError("");
                  }}
                >
                  <Smartphone size={17} />
                  {method === "password" ? "SMS code" : "Password"}
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      if (!email) throw new Error("Enter your email first.");
                      const d = await api("/auth/passkey/options", { email });
                      const response = await startAuthentication({
                        optionsJSON: d.options,
                      });
                      await api("/auth/passkey/verify", {
                        requestId: d.requestId,
                        response,
                      });
                      onLogin();
                    })
                  }
                >
                  <Fingerprint size={17} />
                  Device passkey
                </button>
              </div>
              <p className="under-note">
                A passkey uses your device’s face, fingerprint, or PIN
                verification.
              </p>
            </>
          )}
          <p className="auth-switch">
            {mode === "register" ? "Already have an account?" : "New to Folio?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setMethod("password");
                setError("");
              }}
            >
              {mode === "register" ? "Sign in" : "Create an account"}
            </button>
          </p>
          <div className="divider-text">TAKE A LOOK AROUND</div>
          <button
            className="demo-button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("/auth/demo", {});
                onLogin();
              })
            }
          >
            Explore the demo <ArrowUpRight size={17} />
          </button>
          <small className="auth-demo-note">
            A separate workspace with sample data. No sign-up needed.
          </small>
        </div>
      </div>
    </div>
  );
}
function SharedView({ token }: { token: string }) {
  const [data, setData] = useState<{
      name: string;
      grant: Grant;
      records: HealthRecord[];
    } | null>(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<HealthRecord | null>(null);
  const load = () =>
    api(`/shared/${token}`)
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [token]);
  return (
    <div className="shared-page">
      <Logo />
      <div className="shared-header">
        <span className="eyebrow">PRIVATE CARE CONNECTION</span>
        <h1>
          {data ? `${data.name}'s shared records` : "Your care connection"}
        </h1>
        <p>
          {data
            ? `For ${data.grant.recipient} · Access expires ${shortTime(data.grant.expires)}`
            : "Opening this private sharing link…"}
        </p>
      </div>
      {error ? (
        <div className="form-error">{error}</div>
      ) : (
        data && (
          <>
            <p className="under-note">
              <ShieldCheck size={15} />
              Only the records authorized for this connection are shown. Views
              and edits are recorded in the owner's access log.
            </p>
            {data.records.length ? (
              data.records.map((r) => (
                <section className="panel shared-record" key={r.id}>
                  <div className="panel-head">
                    <div className="record-title">
                      <RecordIcon type={r.type} />
                      <div>
                        <h3>{r.title}</h3>
                        <p>
                          {shortDate(r.date)} · {r.provider}
                        </p>
                      </div>
                    </div>
                    <span className="tag">{r.type}</span>
                  </div>
                  <p>{r.notes || "No notes."}</p>
                  {r.file && (
                    <button
                      className="secondary"
                      onClick={() => download(r.file!.name, r.file!.data)}
                    >
                      <ArrowDownToLine size={16} />
                      Download report
                    </button>
                  )}
                  {data.grant.editable &&
                    !(data.grant.lockAllergies && r.type === "Allergy") && (
                      <button
                        className="text-button"
                        onClick={() => setEditing(r)}
                      >
                        Edit notes <ArrowRight size={14} />
                      </button>
                    )}
                </section>
              ))
            ) : (
              <Empty
                title="No records in this selection"
                text="The owner has not added records matching this authorization."
              />
            )}
          </>
        )
      )}
      {editing && (
        <Modal
          title="Edit shared record notes"
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(
                  `/shared/${token}/records/${editing.id}`,
                  { notes: new FormData(e.currentTarget).get("notes") },
                  "PUT",
                );
                setEditing(null);
                load();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Field label="Notes">
              <textarea
                name="notes"
                defaultValue={editing.notes}
                rows={8}
                maxLength={20000}
              />
            </Field>
            <FormActions
              busy={false}
              onCancel={() => setEditing(null)}
              label="Save notes"
            />
          </form>
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
