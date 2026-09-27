import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createCipheriv, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import os from "node:os";
const port = 5187,
  base = `http://localhost:${port}`,
  dir = mkdtempSync(path.join(os.tmpdir(), "folio-test-"));
const child = spawn(process.execPath, ["server/index.mjs", "--production"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), APP_ORIGIN: base, DATA_DIR: dir },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let output = "";
child.stdout.on("data", (b) => (output += b));
child.stderr.on("data", (b) => (output += b));
const ready = new Promise((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error(output || "Server did not start")),
    60000,
  );
  child.stdout.on("data", (b) => {
    if (String(b).includes("Folio is ready")) {
      clearTimeout(timeout);
      resolve();
    }
  });
  child.on("exit", (code) => {
    if (code) reject(new Error(output));
  });
});
async function call(url, { cookie, body, method, origin } = {}) {
  const r = await fetch(base + "/api" + url, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
const getState = async (cookie) => (await call("/state", { cookie })).data.state;
test("authenticated health workflows enforce isolation, locks, revocation, and persist history", async (t) => {
  await ready;
  t.after(() => child.kill());
  assert.equal((await call("/state")).status, 401);
  const a = await call("/auth/register", {
    body: {
      name: "Test owner",
      email: "owner@test.example",
      password: "test-password-at-least-12",
    },
  });
  assert.equal(a.status, 200);
  assert.ok(a.cookie);
  const cookie = a.cookie;
  assert.equal(
    (
      await call("/auth/login", {
        body: { email: "owner@test.example", password: "wrong" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call("/profile", {
        cookie,
        method: "PUT",
        body: { name: "Intruder" },
        origin: "https://untrusted.example",
      })
    ).status,
    403,
  );
  const lab = {
    title: "PRIVATE-LAB-TEXT",
    type: "Lab result",
    date: "2026-09-01",
    provider: "Test clinic",
    condition: "Sample",
    notes: "Original notes",
    file: null,
  };
  let r = await call("/records", { cookie, body: lab });
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.ok(!r.data.state);
  const labId = (await getState(cookie)).records[0].id;
  r = await call(`/records/${labId}`, {
    cookie,
    method: "PUT",
    body: { ...lab, notes: "Revised notes" },
  });
  assert.equal(r.data.ok, true);
  assert.equal((await getState(cookie)).records[0].version, 2);
  assert.equal((await call("/history", { cookie })).data[0].before.notes, "Original notes");
  const profileChange = await call("/profile", {
    cookie,
    method: "PUT",
    body: { name: "Updated owner", allergies: "Sample allergy" },
  });
  assert.equal(profileChange.data.ok, true);
  const profileHistory = await call("/history", { cookie });
  assert.equal(profileHistory.data[0].before.name, "Test owner");
  assert.equal(
    profileHistory.data[0].snapshot.name,
    "Updated owner",
  );
  assert.equal(
    (await call("/records", { cookie, body: { ...lab, date: "2026-02-31" } }))
      .status,
    400,
  );
  r = await call("/records", {
    cookie,
    body: { ...lab, title: "Locked allergy", type: "Allergy" },
  });
  const allergyId = (await getState(cookie)).records.find((r) => r.type === "Allergy").id;
  r = await call("/metrics", {
    cookie,
    body: {
      date: "2026-09-01",
      systolic: 120,
      diastolic: 80,
      glucose: 91,
      heartRate: 70,
    },
  });
  assert.equal(r.status, 200);
  assert.equal(
    (
      await call("/metrics", {
        cookie,
        body: {
          date: "2026-09-01",
          systolic: 80,
          diastolic: 120,
          glucose: 91,
          heartRate: 70,
        },
      })
    ).status,
    400,
  );
  const b = await call("/auth/register", {
    body: {
      name: "Other owner",
      email: "other@test.example",
      password: "test-password-at-least-12",
    },
  });
  assert.equal(
    (await call("/state", { cookie: b.cookie })).data.state.records.length,
    0,
  );
  assert.equal(
    (
      await call(`/records/${labId}`, {
        cookie: b.cookie,
        method: "PUT",
        body: lab,
      })
    ).status,
    404,
  );
  const pdf = `data:application/pdf;base64,${Buffer.alloc(5 * 1024 * 1024, 65).toString("base64")}`;
  const attachedIds = [];
  for (let index = 0; index < 3; index++) {
    const attached = await call("/records", {
      cookie,
      body: {
        ...lab,
        title: `Attached report ${index}`,
        date: "2026-08-01",
        file: { name: `report-${index}.pdf`, data: pdf },
      },
    });
    assert.equal(attached.status, 200);
    assert.equal(attached.data.ok, true);
    assert.ok(Buffer.byteLength(JSON.stringify(attached.data)) < 1000);
    const saved = (await getState(cookie)).records.find(
      (record) => record.title === `Attached report ${index}`,
    );
    assert.ok(saved.file.id);
    assert.ok(!("data" in saved.file));
    attachedIds.push(saved.file.id);
    const response = await fetch(base + saved.file.url, {
      headers: { Cookie: cookie },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.arrayBuffer()).byteLength, 5 * 1024 * 1024);
  }
  const historyWithFiles = await call("/history", { cookie });
  assert.ok(!JSON.stringify(historyWithFiles.data).includes(pdf));
  assert.equal(new Set(attachedIds).size, 3, "each uploaded attachment has its own id");
  let attachmentsDb = new DatabaseSync(path.join(dir, "folio.sqlite"));
  assert.equal(
    attachmentsDb.prepare("SELECT state FROM users WHERE email=?").get("owner@test.example").state,
    "",
  );
  assert.equal(
    attachmentsDb.prepare("SELECT count(*) AS count FROM attachments").get().count,
    3,
  );
  const sectionRows = () =>
    attachmentsDb
      .prepare("SELECT section,value FROM user_state_sections WHERE user_id=(SELECT id FROM users WHERE email=?) ORDER BY section")
      .all("owner@test.example");
  const recordRows = () =>
    attachmentsDb
      .prepare("SELECT record_id,value FROM user_records WHERE user_id=(SELECT id FROM users WHERE email=?) ORDER BY record_id")
      .all("owner@test.example");
  const recordsBefore = (await getState(cookie)).records.length;
  assert.ok(!sectionRows().some(({ section }) => section === "records"));
  assert.equal(recordRows().length, recordsBefore, "each record is stored in its own encrypted row");
  const beforeRead = sectionRows();
  const logsBeforeRead = attachmentsDb
    .prepare("SELECT count(*) AS count FROM access_logs WHERE user_id=(SELECT id FROM users WHERE email=?)")
    .get("owner@test.example").count;
  await call("/state", { cookie });
  await call("/history", { cookie });
  assert.deepEqual(sectionRows(), beforeRead, "read auditing does not rewrite state sections");
  assert.equal(
    attachmentsDb
      .prepare("SELECT count(*) AS count FROM access_logs WHERE user_id=(SELECT id FROM users WHERE email=?)")
      .get("owner@test.example").count,
    logsBeforeRead + 2,
  );
  const beforeTinyMutation = new Map(
    recordRows().map(({ record_id, value }) => [record_id, value]),
  );
  const tinyStart = performance.now();
  const tinyMutation = await call("/records", {
    cookie,
    body: { ...lab, title: "Small record with three large attachments", file: null },
  });
  const tinyDuration = performance.now() - tinyStart;
  assert.equal(tinyMutation.status, 200);
  assert.ok(Buffer.byteLength(JSON.stringify(tinyMutation.data)) < 1000);
  assert.ok(tinyDuration < 100, `small record mutation with 3 files took ${tinyDuration.toFixed(1)} ms`);
  const afterTinyMutation = new Map(
    recordRows().map(({ record_id, value }) => [record_id, value]),
  );
  for (const [recordId, value] of beforeTinyMutation)
    assert.equal(afterTinyMutation.get(recordId), value, "adding a record does not rewrite existing record rows");
  assert.equal(afterTinyMutation.size, beforeTinyMutation.size + 1);

  const attachedRecord = (await getState(cookie)).records.find(
    (record) => record.title === "Attached report 0",
  );
  assert.equal(attachedRecord.file.id, attachedIds[0]);
  const beforeRecordEdit = new Map(
    recordRows().map(({ record_id, value }) => [record_id, value]),
  );
  const removeAttachment = await call(`/records/${attachedRecord.id}`, {
    cookie,
    method: "PUT",
    body: { ...lab, title: attachedRecord.title, date: attachedRecord.date, file: null },
  });
  assert.equal(removeAttachment.status, 200, JSON.stringify(removeAttachment.data));
  const afterRecordEdit = new Map(
    recordRows().map(({ record_id, value }) => [record_id, value]),
  );
  assert.notEqual(afterRecordEdit.get(attachedRecord.id), beforeRecordEdit.get(attachedRecord.id));
  for (const [recordId, value] of beforeRecordEdit)
    if (recordId !== attachedRecord.id)
      assert.equal(afterRecordEdit.get(recordId), value, "editing a record does not rewrite other record rows");
  const updatedAttachedRecord = (await getState(cookie)).records.find(
    (record) => record.id === attachedRecord.id,
  );
  assert.equal(updatedAttachedRecord.file, null);
  const recordRefs = (await getState(cookie)).records.filter(
    (record) => record.file?.id === attachedIds[0],
  );
  assert.equal(recordRefs.length, 0, "no current record references the removed attachment");
  attachmentsDb.close();
  attachmentsDb = new DatabaseSync(path.join(dir, "folio.sqlite"));
  assert.equal(
    attachmentsDb.prepare("SELECT count(*) AS count FROM attachments").get().count,
    2,
    "replacing/removing a file deletes its now-unreferenced encrypted blob",
  );

  const legacyRecords = (await getState(cookie)).records.map((record) => {
    const { url, ...file } = record.file || {};
    return { ...record, file: record.file ? file : null };
  });
  const key = readFileSync(path.join(dir, "encryption.key")),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv),
    encryptedRecords = Buffer.concat([
      cipher.update(JSON.stringify(legacyRecords)),
      cipher.final(),
    ]),
    encryptedSection = Buffer.concat([iv, cipher.getAuthTag(), encryptedRecords]).toString("base64");
  const ownerId = attachmentsDb
    .prepare("SELECT id FROM users WHERE email=?")
    .get("owner@test.example").id;
  attachmentsDb.prepare("DELETE FROM user_records WHERE user_id=?").run(ownerId);
  attachmentsDb
    .prepare("INSERT INTO user_state_sections (user_id,section,value) VALUES (?, 'records', ?)")
    .run(ownerId, encryptedSection);
  assert.equal((await getState(cookie)).records.length, legacyRecords.length);
  assert.equal(recordRows().length, legacyRecords.length);
  assert.ok(!sectionRows().some(({ section }) => section === "records"));
  attachmentsDb.close();
  const g = await call("/grants", {
    cookie,
    body: {
      recipient: "Test clinician",
      email: "doctor@test.example",
      types: ["Lab result", "Allergy"],
      from: "2026-09-01",
      to: "2026-09-01",
      days: 1,
      editable: true,
      lockAllergies: true,
    },
  });
  assert.equal(g.status, 200);
  assert.equal(g.data.ok, true);
  const token = g.data.url.split("/").at(-1),
    grantId = (await getState(cookie)).grants[0].id;
  assert.equal((await call(`/shared/${token}`)).data.records.length, 3);
  assert.equal(
    (
      await call(`/shared/${token}/records/${allergyId}`, {
        method: "PUT",
        body: { notes: "Forbidden edit" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(`/shared/${token}/records/${labId}`, {
        method: "PUT",
        body: { notes: "Authorized note" },
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/state", { cookie })).data.state.records.find(
      (r) => r.id === labId,
    ).notes,
    "Authorized note",
  );
  await call(`/grants/${grantId}/revoke`, { cookie, body: {} });
  assert.equal((await call(`/shared/${token}`)).status, 403);
  const exp = await call("/grants", {
    cookie,
    body: {
      recipient: "Expired",
      email: "expired@test.example",
      types: ["Lab result"],
      from: "2026-09-01",
      to: "2026-09-01",
      days: 0.000000001,
    },
  });
  assert.equal(
    (await call(`/shared/${exp.data.url.split("/").at(-1)}`)).status,
    403,
  );
  const fhir = {
    resourceType: "Bundle",
    entry: [
      {
        resource: {
          resourceType: "Observation",
          id: "lab-1",
          code: { text: "FHIR sample" },
          effectiveDateTime: "2026-09-01",
        },
      },
    ],
  };
  assert.equal((await call("/import", { cookie, body: fhir })).data.count, 1);
  assert.equal((await call("/import", { cookie, body: fhir })).data.count, 0);
  const imported = (await call("/state", { cookie })).data.state.records.find(
    (r) => r.externalId === "Observation/lab-1",
  );
  assert.ok(imported, "an imported record keeps its FHIR external id");
  const editedImport = await call(`/records/${imported.id}`, {
    cookie,
    method: "PUT",
    body: { ...lab, title: "Edited import", notes: "Edited after import" },
  });
  assert.equal(editedImport.data.ok, true);
  assert.equal(
    (await getState(cookie)).records.find((r) => r.id === imported.id).externalId,
    "Observation/lab-1",
    "editing a record preserves its external id",
  );
  assert.equal((await call("/import", { cookie, body: fhir })).data.count, 0);
  assert.equal(
    (await call("/state", { cookie })).data.state.records.filter(
      (r) => r.externalId === "Observation/lab-1",
    ).length,
    1,
    "editing an imported record does not cause a duplicate import",
  );
  const archive = await call("/export", { cookie });
  assert.equal(archive.data.format, "folio-archive-v1");
  assert.ok(
    archive.data.state.logs.some(
      (l) => l.action === "Edited" && l.actor.includes("clinician"),
    ),
  );
  assert.equal(
    (await call("/auth/sms/send", { body: { email: "owner@test.example" } }))
      .status,
    503,
  );
  assert.equal((await call("/sync", { cookie, body: {} })).status, 503);
  assert.equal(
    (await call("/passkeys/register/options", { cookie })).data
      .authenticatorSelection.userVerification,
    "required",
  );
  const dataFile = readFileSync(path.join(dir, "folio.sqlite"));
  const wal = readFileSync(path.join(dir, "folio.sqlite-wal"));
  assert.ok(!dataFile.includes(Buffer.from("PRIVATE-LAB-TEXT")));
  assert.ok(!wal.includes(Buffer.from("PRIVATE-LAB-TEXT")));
  await call("/logout", { cookie, body: {} });
  assert.equal((await call("/state", { cookie })).status, 401);
  const again = await call("/auth/login", {
    body: {
      email: "owner@test.example",
      password: "test-password-at-least-12",
    },
  });
  assert.equal(again.status, 200, JSON.stringify(again.data));
  assert.ok(again.cookie);
  const persistedAgain = await call("/state", { cookie: again.cookie });
  assert.equal(persistedAgain.status, 200, JSON.stringify(persistedAgain.data));
  assert.ok(persistedAgain.data.state.records.length >= 3);
});
