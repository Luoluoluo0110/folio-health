import express from "express";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import {
  id,
  hash,
  types,
  initialState,
  audit,
  grantActive,
  scopedRecords,
  canEdit,
  importFHIR,
} from "./model.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.env.DATA_DIR || path.join(root, "data");
mkdirSync(dir, { recursive: true });
const keyPath = path.join(dir, "encryption.key");
if (!existsSync(keyPath))
  writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
const key = readFileSync(keyPath);
const encrypt = (data) => {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key, iv);
  const b = Buffer.concat([c.update(JSON.stringify(data)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), b]).toString("base64");
};
const decrypt = (value) => {
  const b = Buffer.from(value, "base64"),
    d = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([d.update(b.subarray(28)), d.final()]).toString(),
  );
};
const db = new DatabaseSync(path.join(dir, "folio.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, password TEXT, salt TEXT, demo INTEGER, state TEXT); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT, expires INTEGER); CREATE TABLE IF NOT EXISTS shares (token TEXT PRIMARY KEY, user_id TEXT, grant_id TEXT);",
);
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));
const port = Number(process.env.PORT || 5173),
  origin = process.env.APP_ORIGIN || `http://localhost:${port}`,
  rpID = new URL(origin).hostname;
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store",
  });
  if (
    req.path.startsWith("/api/") &&
    !["GET", "HEAD"].includes(req.method) &&
    req.get("origin") &&
    req.get("origin") !== origin
  )
    return res
      .status(403)
      .json({ error: "This request came from a different origin." });
  next();
});
const save = (uid, state) =>
  db.prepare("UPDATE users SET state=? WHERE id=?").run(encrypt(state), uid);
const load = (uid) => {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(uid);
  return u ? { ...u, state: decrypt(u.state) } : null;
};
const cookie = (req) =>
  req.headers.cookie
    ?.split("; ")
    .find((c) => c.startsWith("folio_session="))
    ?.split("=")[1];
const session = (req, res, uid) => {
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
    hash(token),
    uid,
    Date.now() + 8 * 3600000,
  );
  res.cookie("folio_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: origin.startsWith("https:"),
    maxAge: 8 * 3600000,
    path: "/",
  });
};
const auth = (req, res, next) => {
  const s = db
    .prepare("SELECT * FROM sessions WHERE token=? AND expires>?")
    .get(hash(cookie(req) || ""), Date.now());
  if (!s) return res.status(401).json({ error: "Please sign in to continue." });
  req.user = load(s.user_id);
  req.state = req.user.state;
  next();
};
const safeState = (s) => ({
  ...s,
  passkeys: s.passkeys.map((p) => ({ id: p.id, name: p.name })),
  grants: s.grants.map(({ tokenHash, ...g }) => ({
    ...g,
    active: grantActive(g),
  })),
  records: [...s.records].sort((a, b) => b.date.localeCompare(a.date)),
});
const changed = (req, res, action, detail, extra = {}) => {
  audit(req.state, action, detail, "You", req.ip);
  save(req.user.id, req.state);
  res.json({ state: safeState(req.state), ...extra });
};
const fail = (res, message, status = 400) =>
  res.status(status).json({ error: message });
const rate = new Map();
app.use("/api/auth", (req, res, next) => {
  const k = req.ip,
    t = Date.now(),
    r = rate.get(k);
  if (!r || r.until < t) rate.set(k, { count: 1, until: t + 60000 });
  else if (++r.count > 25)
    return fail(res, "Too many attempts. Please wait one minute.", 429);
  next();
});
function createUser(email, password, name, demo = false) {
  const uid = id(),
    salt = randomBytes(16).toString("hex"),
    state = initialState(demo, name);
  state.profile.email = email;
  audit(state, "Created", "Health workspace created");
  db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?)").run(
    uid,
    email,
    scryptSync(password, salt, 64).toString("hex"),
    salt,
    demo ? 1 : 0,
    encrypt(state),
  );
  return uid;
}
app.post("/api/auth/demo", (req, res) => {
  const uid = createUser(
    `demo-${id()}@example.com`,
    randomBytes(32).toString("hex"),
    "Alex Morgan",
    true,
  );
  session(req, res, uid);
  res.json({ ok: true });
});
app.post("/api/auth/register", (req, res) => {
  const { email, password, name } = req.body;
  if (
    typeof email !== "string" ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    email.length > 200 ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 200 ||
    !name?.trim()
  )
    return fail(
      res,
      "Enter your name, a valid email, and a password of at least 12 characters.",
    );
  try {
    const uid = createUser(
      email.toLowerCase().trim(),
      password,
      name.slice(0, 100),
    );
    session(req, res, uid);
    res.json({ ok: true });
  } catch {
    return fail(res, "Unable to create this account. Try another email.");
  }
});
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const u =
    typeof email === "string"
      ? db
          .prepare("SELECT * FROM users WHERE email=? AND demo=0")
          .get(email.toLowerCase().trim())
      : null;
  const candidate = scryptSync(
    String(password || "").slice(0, 200),
    u?.salt || "dummy-salt",
    64,
  );
  if (!u || !timingSafeEqual(candidate, Buffer.from(u.password, "hex"))) {
    if (u) {
      const state = decrypt(u.state);
      audit(
        state,
        "Denied",
        "Unsuccessful password sign-in",
        "Unverified visitor",
        req.ip,
      );
      save(u.id, state);
    }
    return fail(res, "Email or password is incorrect.", 401);
  }
  const s = decrypt(u.state);
  audit(s, "Signed in", "Password authentication", "You", req.ip);
  save(u.id, s);
  session(req, res, u.id);
  res.json({ ok: true });
});
app.post("/api/logout", auth, (req, res) => {
  audit(req.state, "Signed out", "Session ended", "You", req.ip);
  save(req.user.id, req.state);
  db.prepare("DELETE FROM sessions WHERE token=?").run(hash(cookie(req)));
  res.clearCookie("folio_session", { path: "/" });
  res.json({ ok: true });
});
app.get("/api/state", auth, (req, res) => {
  audit(
    req.state,
    "Viewed",
    "Health workspace and record index",
    "You",
    req.ip,
  );
  save(req.user.id, req.state);
  res.json({
    state: safeState(req.state),
    demo: !!req.user.demo,
    services: {
      sms: !!(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_VERIFY_SERVICE_SID
      ),
      hospital: !!(
        process.env.FHIR_URL &&
        process.env.FHIR_PATIENT_ID &&
        process.env.FHIR_ACCOUNT_EMAIL
      ),
    },
  });
});
app.put("/api/profile", auth, (req, res) => {
  const p = req.body,
    before = structuredClone(req.state.profile);
  if (p.name !== undefined && (!p.name.trim() || p.name.length > 100))
    return fail(res, "Enter a name under 100 characters.");
  if (p.phone && !/^\+[1-9]\d{7,14}$/.test(p.phone))
    return fail(res, "Use an international phone number, starting with +.");
  for (const k of Object.keys(req.state.profile)) {
    if (k === "email") continue;
    if (typeof p[k] === "string" && p[k].length <= 4000)
      req.state.profile[k] = p[k];
  }
  req.state.history.unshift({
    id: id(),
    timestamp: new Date().toISOString(),
    title: "Personal profile",
    before,
    detail: "Personal information updated",
    snapshot: structuredClone(req.state.profile),
  });
  changed(req, res, "Edited", "Personal profile updated");
});
const validDate = (d) =>
  typeof d === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  !isNaN(Date.parse(d)) &&
  new Date(d).toISOString().slice(0, 10) === d;
function recordInput(body) {
  if (
    !body.title?.trim() ||
    body.title.length > 200 ||
    !types.includes(body.type) ||
    !validDate(body.date) ||
    typeof body.notes !== "string" ||
    body.notes.length > 20000
  )
    throw new Error(
      "Please enter a title, record type, valid date, and notes under 20,000 characters.",
    );
  if (
    body.file &&
    (!/^data:(application\/pdf|image\/(png|jpeg));base64,/.test(
      body.file.data,
    ) ||
      body.file.data.length > 7500000)
  )
    throw new Error("Attach a PDF, PNG, or JPEG up to 5 MB.");
  return {
    title: body.title.trim(),
    type: body.type,
    date: body.date,
    provider: String(body.provider || "").slice(0, 200),
    condition: String(body.condition || "").slice(0, 200),
    notes: body.notes,
    file: body.file || null,
  };
}
app.post("/api/records", auth, (req, res) => {
  const r = { ...recordInput(req.body), id: id(), version: 1 };
  req.state.records.push(r);
  req.state.history.unshift({
    id: id(),
    timestamp: new Date().toISOString(),
    title: r.title,
    detail: "Record created",
    snapshot: r,
  });
  changed(req, res, "Added", r.title);
});
app.put("/api/records/:id", auth, (req, res) => {
  const old = req.state.records.find((r) => r.id === req.params.id);
  if (!old) return fail(res, "Record not found.", 404);
  const r = { ...recordInput(req.body), id: old.id, version: old.version + 1 };
  req.state.history.unshift({
    id: id(),
    timestamp: new Date().toISOString(),
    title: old.title,
    detail: `Version ${old.version} → ${r.version}`,
    before: old,
    snapshot: r,
  });
  req.state.records = req.state.records.map((x) => (x.id === old.id ? r : x));
  changed(req, res, "Edited", r.title);
});
app.post("/api/records/:id/view", auth, (req, res) => {
  const r = req.state.records.find((r) => r.id === req.params.id);
  if (!r) return fail(res, "Record not found.", 404);
  changed(req, res, "Viewed", r.title);
});
app.post("/api/metrics", auth, (req, res) => {
  const m = req.body;
  if (
    !validDate(m.date) ||
    !["systolic", "diastolic", "glucose", "heartRate"].every(
      (k) =>
        Number.isFinite(Number(m[k])) &&
        Number(m[k]) > 0 &&
        Number(m[k]) < 1000,
    ) ||
    Number(m.diastolic) >= Number(m.systolic)
  )
    return fail(
      res,
      "Enter valid positive readings. Diastolic must be below systolic.",
    );
  req.state.metrics.push({
    id: id(),
    date: m.date,
    ...Object.fromEntries(
      ["systolic", "diastolic", "glucose", "heartRate"].map((k) => [
        k,
        Number(m[k]),
      ]),
    ),
  });
  req.state.metrics.sort((a, b) => a.date.localeCompare(b.date));
  changed(req, res, "Added", "Health measurements");
});
app.put("/api/targets", auth, (req, res) => {
  for (const k of ["systolic", "glucose", "heartRate"]) {
    const r = req.body[k];
    if (
      !r ||
      !Number.isFinite(+r.min) ||
      !Number.isFinite(+r.max) ||
      +r.min < 0 ||
      +r.max <= +r.min
    )
      return fail(
        res,
        "Each upper limit must be greater than its lower limit.",
      );
  }
  req.state.targets = req.body;
  changed(req, res, "Edited", "Personal reference ranges");
});
app.post("/api/grants", auth, (req, res) => {
  const b = req.body;
  if (
    !b.recipient?.trim() ||
    !/^\S+@\S+\.\S+$/.test(b.email || "") ||
    !Array.isArray(b.types) ||
    !b.types.length ||
    b.types.some((t) => !types.includes(t)) ||
    !validDate(b.from) ||
    !validDate(b.to) ||
    b.from > b.to ||
    !Number.isFinite(+b.days) ||
    +b.days <= 0 ||
    +b.days > 90
  )
    return fail(
      res,
      "Choose a recipient, record types, valid date range, and duration (1–90 days).",
    );
  const token = randomBytes(32).toString("hex");
  const g = {
    id: id(),
    recipient: b.recipient.slice(0, 100),
    email: b.email,
    role: b.role || "Care team",
    types: b.types,
    from: b.from,
    to: b.to,
    expires: new Date(Date.now() + Number(b.days) * 86400000).toISOString(),
    editable: !!b.editable,
    lockAllergies: b.lockAllergies !== false,
    revoked: false,
    tokenHash: hash(token),
  };
  req.state.grants.push(g);
  audit(
    req.state,
    "Authorized",
    `${g.recipient} · ${g.types.join(", ")} · expires ${g.expires}`,
    "You",
    req.ip,
  );
  db.exec("BEGIN");
  try {
    save(req.user.id, req.state);
    db.prepare("INSERT INTO shares VALUES (?,?,?)").run(
      hash(token),
      req.user.id,
      g.id,
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  res.json({ state: safeState(req.state), url: `${origin}/share/${token}` });
});
app.post("/api/grants/:id/revoke", auth, (req, res) => {
  const g = req.state.grants.find((g) => g.id === req.params.id);
  if (!g) return fail(res, "Authorization not found.", 404);
  g.revoked = true;
  changed(req, res, "Revoked", `Access for ${g.recipient}`);
});
function share(req, res, next) {
  const row = db
    .prepare("SELECT * FROM shares WHERE token=?")
    .get(hash(req.params.token));
  if (!row) return fail(res, "This sharing link is unavailable.", 404);
  req.owner = load(row.user_id);
  req.grant = req.owner.state.grants.find((g) => g.id === row.grant_id);
  if (!req.grant || !grantActive(req.grant)) {
    audit(
      req.owner.state,
      "Denied",
      "Expired or revoked sharing link was opened",
      "Sharing-link visitor",
      req.ip,
    );
    save(req.owner.id, req.owner.state);
    return fail(res, "This authorization has expired or been revoked.", 403);
  }
  next();
}
app.get("/api/shared/:token", share, (req, res) => {
  const s = req.owner.state;
  audit(
    s,
    "Viewed",
    `Shared records · ${req.grant.types.join(", ")}`,
    `${req.grant.recipient} (sharing link)`,
    req.ip,
  );
  save(req.owner.id, s);
  res.json({
    name: s.profile.name,
    grant: {
      recipient: req.grant.recipient,
      expires: req.grant.expires,
      editable: req.grant.editable,
      lockAllergies: req.grant.lockAllergies,
    },
    records: scopedRecords(s, req.grant),
  });
});
app.put("/api/shared/:token/records/:id", share, (req, res) => {
  const s = req.owner.state,
    old = scopedRecords(s, req.grant).find((r) => r.id === req.params.id);
  if (!old || !canEdit(req.grant, old))
    return fail(res, "You do not have permission to edit this record.", 403);
  if (typeof req.body.notes !== "string" || req.body.notes.length > 20000)
    return fail(res, "Enter notes under 20,000 characters.");
  const r = { ...old, notes: req.body.notes, version: old.version + 1 };
  s.records = s.records.map((x) => (x.id === r.id ? r : x));
  s.history.unshift({
    id: id(),
    timestamp: new Date().toISOString(),
    title: r.title,
    detail: `Updated through ${req.grant.recipient} sharing link`,
    before: old,
    snapshot: r,
  });
  audit(s, "Edited", r.title, `${req.grant.recipient} (sharing link)`, req.ip);
  save(req.owner.id, s);
  res.json({ ok: true });
});
function doImport(req, res, bundle) {
  req.state = load(req.user.id).state;
  const incoming = importFHIR(bundle),
    known = new Set(req.state.records.map((r) => r.externalId).filter(Boolean)),
    fresh = incoming.filter((r) => {
      if (known.has(r.externalId)) return false;
      known.add(r.externalId);
      return true;
    });
  req.state.records.push(...fresh);
  for (const r of fresh)
    req.state.history.unshift({
      id: id(),
      timestamp: new Date().toISOString(),
      title: r.title,
      detail: "Imported from FHIR",
      snapshot: r,
    });
  changed(req, res, "Imported", `${fresh.length} hospital records`, {
    count: fresh.length,
  });
}
app.post("/api/import", auth, (req, res) => doImport(req, res, req.body));
app.post("/api/sync", auth, async (req, res) => {
  if (!process.env.FHIR_URL || !process.env.FHIR_PATIENT_ID)
    return fail(
      res,
      "Hospital sync needs a configured FHIR provider and patient mapping.",
      503,
    );
  if (
    !process.env.FHIR_ACCOUNT_EMAIL ||
    req.user.email !== process.env.FHIR_ACCOUNT_EMAIL
  )
    return fail(
      res,
      "This account is not mapped to the configured hospital patient.",
      403,
    );
  const url = new URL(
    `Patient/${encodeURIComponent(process.env.FHIR_PATIENT_ID)}/$everything`,
    process.env.FHIR_URL.endsWith("/")
      ? process.env.FHIR_URL
      : `${process.env.FHIR_URL}/`,
  );
  if (url.protocol !== "https:")
    return fail(res, "The FHIR provider must use HTTPS.");
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.FHIR_TOKEN || ""}`,
      Accept: "application/fhir+json",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    return fail(res, "Hospital provider could not return your records.", 502);
  const b = await response.json();
  if (b.link?.some((l) => l.relation === "next"))
    return fail(
      res,
      "Provider returned multiple pages. Export a complete FHIR Bundle to import instead.",
      422,
    );
  doImport(req, res, b);
});
app.get("/api/export", auth, (req, res) => {
  audit(
    req.state,
    "Exported",
    "Full health archive and access log",
    "You",
    req.ip,
  );
  save(req.user.id, req.state);
  res.json({
    format: "folio-archive-v1",
    exportedAt: new Date().toISOString(),
    state: { ...safeState(req.state), passkeys: [] },
  });
});
app.get("/api/history", auth, (req, res) => {
  audit(req.state, "Viewed", "Revision history", "You", req.ip);
  save(req.user.id, req.state);
  res.json(req.state.history);
});
app.put("/api/settings", auth, (req, res) => {
  req.state.settings.social = false;
  changed(req, res, "Edited", "Preferences saved");
});
const challenges = new Map();
app.get("/api/passkeys/register/options", auth, async (req, res) => {
  const options = await generateRegistrationOptions({
    rpName: "Folio Health",
    rpID,
    userName: req.user.email,
    userID: new TextEncoder().encode(req.user.id),
    attestationType: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "required",
    },
    excludeCredentials: req.state.passkeys.map((p) => ({ id: p.id })),
  });
  challenges.set(req.user.id, {
    value: options.challenge,
    expires: Date.now() + 300000,
  });
  res.json(options);
});
app.post("/api/passkeys/register/verify", auth, async (req, res) => {
  const c = challenges.get(req.user.id);
  challenges.delete(req.user.id);
  if (!c || c.expires < Date.now())
    return fail(res, "Passkey request expired.");
  const result = await verifyRegistrationResponse({
    response: req.body,
    expectedChallenge: c.value,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  if (!result.verified) return fail(res, "Device verification failed.");
  const p = result.registrationInfo.credential;
  req.state = load(req.user.id).state;
  req.state.passkeys.push({
    ...p,
    publicKey: Buffer.from(p.publicKey).toString("base64"),
    name: "Device passkey",
  });
  changed(req, res, "Added", "Device passkey registered");
});
app.post("/api/auth/passkey/options", async (req, res) => {
  const u = db
    .prepare("SELECT * FROM users WHERE email=? AND demo=0")
    .get(String(req.body.email).toLowerCase().trim());
  if (!u) return fail(res, "No passkey is available for this account.");
  const s = decrypt(u.state);
  if (!s.passkeys.length)
    return fail(
      res,
      "Sign in with your password and add a passkey in Settings.",
    );
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: s.passkeys.map((p) => ({
      id: p.id,
      transports: p.transports,
    })),
  });
  const requestId = id();
  challenges.set(requestId, {
    value: options.challenge,
    uid: u.id,
    expires: Date.now() + 300000,
  });
  res.json({ options, requestId });
});
app.post("/api/auth/passkey/verify", async (req, res) => {
  const c = challenges.get(req.body.requestId);
  challenges.delete(req.body.requestId);
  if (!c || c.expires < Date.now())
    return fail(res, "Passkey request expired.");
  const u = load(c.uid),
    p = u.state.passkeys.find((p) => p.id === req.body.response.id);
  if (!p) return fail(res, "Passkey not recognized.");
  const v = await verifyAuthenticationResponse({
    response: req.body.response,
    expectedChallenge: c.value,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: { ...p, publicKey: Buffer.from(p.publicKey, "base64") },
    requireUserVerification: true,
  });
  if (!v.verified) return fail(res, "Device verification failed.");
  p.counter = v.authenticationInfo.newCounter;
  audit(u.state, "Signed in", "Device passkey", "You", req.ip);
  save(u.id, u.state);
  session(req, res, u.id);
  res.json({ ok: true });
});
const codes = new Map();
app.post("/api/auth/sms/send", async (req, res) => {
  if (
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_VERIFY_SERVICE_SID
  )
    return fail(
      res,
      "SMS sign-in is not connected. Use your password or device passkey.",
      503,
    );
  const u = db
    .prepare("SELECT * FROM users WHERE email=? AND demo=0")
    .get(String(req.body.email).toLowerCase().trim());
  const requestId = id();
  if (u) {
    const s = decrypt(u.state);
    if (/^\+[1-9]\d{7,14}$/.test(s.profile.phone)) {
      const result = await fetch(
        `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/Verifications`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: s.profile.phone, Channel: "sms" }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!result.ok)
        return fail(res, "Unable to send a code. Try password sign-in.", 502);
      codes.set(requestId, {
        uid: u.id,
        phone: s.profile.phone,
        expires: Date.now() + 300000,
        attempts: 0,
      });
    }
  }
  res.json({
    requestId,
    message: "If SMS is set up for this account, a code has been sent.",
  });
});
app.post("/api/auth/sms/verify", async (req, res) => {
  const c = codes.get(req.body.requestId);
  if (!c || c.expires < Date.now() || ++c.attempts > 5)
    return fail(res, "Code expired or invalid.");
  const result = await fetch(
    `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: c.phone, Code: String(req.body.code) }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const v = await result.json();
  if (v.status !== "approved") return fail(res, "Code is incorrect.");
  codes.delete(req.body.requestId);
  const u = load(c.uid);
  audit(u.state, "Signed in", "SMS verification", "You", req.ip);
  save(u.id, u.state);
  session(req, res, u.id);
  res.json({ ok: true });
});
app.use("/api", (req, res) => fail(res, "Endpoint not found.", 404));
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status === 413 ? 413 : 400).json({
    error:
      err.status === 413
        ? "This file is too large."
        : err.message || "The request could not be completed.",
  });
});
if (process.argv.includes("--production")) {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*splat}", (req, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    configLoader: "native",
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.listen(port, "127.0.0.1", () => console.log(`Folio is ready at ${origin}`));
