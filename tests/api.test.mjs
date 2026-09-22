import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
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
  const labId = r.data.state.records[0].id;
  r = await call(`/records/${labId}`, {
    cookie,
    method: "PUT",
    body: { ...lab, notes: "Revised notes" },
  });
  assert.equal(r.data.state.history[0].before.notes, "Original notes");
  assert.equal(r.data.state.records[0].version, 2);
  const profileChange = await call("/profile", {
    cookie,
    method: "PUT",
    body: { name: "Updated owner", allergies: "Sample allergy" },
  });
  assert.equal(profileChange.data.state.history[0].before.name, "Test owner");
  assert.equal(
    profileChange.data.state.history[0].snapshot.name,
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
  const allergyId = r.data.state.records.find((r) => r.type === "Allergy").id;
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
  const token = g.data.url.split("/").at(-1),
    grantId = g.data.state.grants[0].id;
  assert.equal((await call(`/shared/${token}`)).data.records.length, 2);
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
  assert.equal(
    editedImport.data.state.records.find((r) => r.id === imported.id)
      .externalId,
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
  assert.ok(
    (await call("/state", { cookie: again.cookie })).data.state.records
      .length >= 3,
  );
});
