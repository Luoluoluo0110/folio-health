import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  grantActive,
  scopedRecords,
  canEdit,
  fuzzyMatch,
  importFHIR,
} from "../server/model.mjs";
test("new accounts are empty and do not inherit another person’s history", () => {
  const s = initialState(false, "Taylor");
  assert.equal(s.profile.name, "Taylor");
  assert.equal(s.records.length, 0);
  assert.equal(s.metrics.length, 0);
  assert.equal(s.grants.length, 0);
  assert.equal(s.settings.social, false);
});
test("fuzzy record search tolerates an edit but preserves multiword matching", () => {
  assert.ok(fuzzyMatch("Annual health checkup Lab result", "chekup"));
  assert.ok(
    fuzzyMatch("Lipid panel cholesterol screening", "lipid cholestrol"),
  );
  assert.ok(!fuzzyMatch("Lipid panel", "heart screening"));
});
test("sharing scope includes only authorized types and dates", () => {
  const s = {
    records: [
      { id: 1, type: "Allergy", date: "2026-09-01" },
      { id: 2, type: "Lab result", date: "2026-09-02" },
      { id: 3, type: "Lab result", date: "2025-09-02" },
    ],
  };
  assert.deepEqual(
    scopedRecords(s, {
      types: ["Lab result"],
      from: "2026-01-01",
      to: "2026-12-31",
    }).map((r) => r.id),
    [2],
  );
});
test("revoked and expired grants fail, including an exact expiration boundary", () => {
  const g = { expires: "2026-09-01T00:00:00.000Z", revoked: false };
  assert.ok(!grantActive(g, Date.parse(g.expires)));
  assert.ok(grantActive(g, Date.parse(g.expires) - 1));
  assert.ok(!grantActive({ ...g, revoked: true }, Date.parse(g.expires) - 1));
});
test("allergy locks override note-edit permission", () => {
  const g = {
    editable: true,
    lockAllergies: true,
    expires: new Date(Date.now() + 60000).toISOString(),
  };
  assert.ok(!canEdit(g, { type: "Allergy" }));
  assert.ok(canEdit(g, { type: "Lab result" }));
  assert.ok(!canEdit({ ...g, editable: false }, { type: "Lab result" }));
});
test("FHIR imports classify reports, preserve stable IDs and reject other formats", () => {
  const records = importFHIR({
    resourceType: "Bundle",
    entry: [
      {
        resource: {
          resourceType: "DiagnosticReport",
          id: "abc",
          code: { text: "Blood panel" },
          issued: "2026-09-01T12:00:00Z",
          conclusion: "Sample",
        },
      },
      {
        resource: {
          resourceType: "AllergyIntolerance",
          id: "allergy",
          code: { text: "Peanut allergy" },
          recordedDate: "2026-09-01",
        },
      },
      { resource: { resourceType: "Patient", id: "patient" } },
    ],
  });
  assert.equal(records.length, 2);
  assert.equal(records[0].externalId, "DiagnosticReport/abc");
  assert.equal(records[0].type, "Lab result");
  assert.equal(records[1].type, "Allergy");
  assert.throws(() => importFHIR({}), /FHIR Bundle/);
});
