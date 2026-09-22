import { randomUUID, createHash } from "node:crypto";
export const id = () => randomUUID();
export const hash = (s) => createHash("sha256").update(s).digest("hex");
export const types = [
  "Lab result",
  "Visit summary",
  "Prescription",
  "Imaging",
  "Allergy",
];
export function initialState(demo = false, name = "Your name") {
  const today = new Date();
  const ago = (n) =>
    new Date(today.getTime() - n * 86400000).toISOString().slice(0, 10);
  return {
    profile: {
      name: demo ? "Alex Morgan" : name,
      email: demo ? "alex@example.com" : "",
      dob: demo ? "1992-06-14" : "",
      bloodType: demo ? "O+" : "",
      phone: "",
      conditions: demo ? "Seasonal allergic rhinitis" : "",
      familyHistory: demo ? "Father: hypertension" : "",
      medications: demo ? "Cetirizine · 10 mg as needed" : "",
      allergies: demo ? "Penicillin · skin rash" : "",
      emergencyContact: demo ? "Jamie Morgan · +1 415 555 0142" : "",
    },
    records: demo
      ? [
          {
            id: id(),
            title: "Annual health checkup",
            type: "Lab result",
            date: ago(2),
            provider: "Evergreen Medical Center",
            condition: "Routine screening",
            notes:
              "Sample report. Complete blood count and metabolic panel reviewed at your annual visit.",
            file: null,
            version: 1,
          },
          {
            id: id(),
            title: "Primary care consultation",
            type: "Visit summary",
            date: ago(8),
            provider: "Dr. Sarah Chen",
            condition: "General wellness",
            notes:
              "Sample visit summary. Discussed sleep, activity, and home monitoring.",
            file: null,
            version: 1,
          },
          {
            id: id(),
            title: "Lipid panel",
            type: "Lab result",
            date: ago(15),
            provider: "Evergreen Medical Center",
            condition: "Cholesterol screening",
            notes:
              "Sample laboratory report. Review results with your care team.",
            file: null,
            version: 1,
          },
          {
            id: id(),
            title: "Seasonal allergy medication",
            type: "Prescription",
            date: ago(20),
            provider: "Dr. Sarah Chen",
            condition: "Allergic rhinitis",
            notes:
              "Cetirizine · sample medication record. This is not a prescription.",
            file: null,
            version: 1,
          },
          {
            id: id(),
            title: "Chest radiograph",
            type: "Imaging",
            date: ago(45),
            provider: "Northside Imaging",
            condition: "Routine follow-up",
            notes: "Sample imaging record. Original images are not attached.",
            file: null,
            version: 1,
          },
          {
            id: id(),
            title: "Penicillin allergy",
            type: "Allergy",
            date: ago(90),
            provider: "Self-reported",
            condition: "Drug allergy",
            notes:
              "Skin rash. Confirmed history should be discussed with your clinician.",
            file: null,
            version: 1,
          },
        ]
      : [],
    metrics: demo
      ? Array.from({ length: 28 }, (_, i) => ({
          id: id(),
          date: ago(27 - i),
          systolic: Math.round(119 + Math.sin(i * 1.6) * 5 + (27 - i) * 0.28),
          diastolic: Math.round(77 + Math.cos(i) * 3),
          glucose: Math.round(91 + Math.sin(i * 1.1) * 6),
          heartRate: Math.round(68 + Math.cos(i * 1.8) * 5),
        }))
      : [],
    targets: {
      systolic: { min: 100, max: 130 },
      glucose: { min: 70, max: 100 },
      heartRate: { min: 60, max: 100 },
    },
    grants: demo
      ? [
          {
            id: id(),
            recipient: "Dr. Sarah Chen",
            email: "sarah.chen@example.com",
            role: "Primary care physician",
            types: ["Lab result", "Visit summary"],
            from: ago(365),
            to: ago(0),
            expires: new Date(Date.now() + 7 * 86400000).toISOString(),
            editable: false,
            lockAllergies: true,
            revoked: false,
            tokenHash: null,
          },
        ]
      : [],
    history: [],
    logs: [],
    settings: { social: false },
    connections: [],
    passkeys: [],
  };
}
export function audit(
  state,
  action,
  detail,
  actor = "You",
  location = "Local device",
) {
  state.logs.unshift({
    id: id(),
    timestamp: new Date().toISOString(),
    actor,
    action,
    detail,
    location,
  });
}
export function grantActive(g, now = Date.now()) {
  return !g.revoked && Date.parse(g.expires) > now;
}
export function scopedRecords(state, grant) {
  return state.records.filter(
    (r) =>
      grant.types.includes(r.type) &&
      r.date >= grant.from &&
      r.date <= grant.to,
  );
}
export function canEdit(grant, record) {
  return (
    grantActive(grant) &&
    grant.editable &&
    !(grant.lockAllergies && record.type === "Allergy")
  );
}
export function fuzzyMatch(value, query) {
  const text = value.toLowerCase();
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .every((word) => {
      if (text.includes(word)) return true;
      return text.split(/\W+/).some((candidate) => {
        if (Math.abs(candidate.length - word.length) > 1 || word.length < 4)
          return false;
        const d = Array.from({ length: word.length + 1 }, (_, i) => i);
        for (let j = 1; j <= candidate.length; j++) {
          let prev = d[0];
          d[0] = j;
          for (let i = 1; i <= word.length; i++) {
            const old = d[i];
            d[i] = Math.min(
              d[i] + 1,
              d[i - 1] + 1,
              prev + (word[i - 1] === candidate[j - 1] ? 0 : 1),
            );
            prev = old;
          }
        }
        return d[word.length] <= 1;
      });
    });
}
export function importFHIR(bundle) {
  if (bundle?.resourceType !== "Bundle" || !Array.isArray(bundle.entry))
    throw new Error("Choose a FHIR Bundle JSON file.");
  const records = [];
  for (const { resource: r } of bundle.entry) {
    if (
      !r ||
      ![
        "DiagnosticReport",
        "DocumentReference",
        "MedicationRequest",
        "Encounter",
        "AllergyIntolerance",
        "Observation",
      ].includes(r.resourceType)
    )
      continue;
    const type =
      r.resourceType === "MedicationRequest"
        ? "Prescription"
        : r.resourceType === "AllergyIntolerance"
          ? "Allergy"
          : r.resourceType === "Encounter"
            ? "Visit summary"
            : "Lab result";
    const title =
      r.code?.text ||
      r.code?.coding?.[0]?.display ||
      r.type?.text ||
      r.medicationCodeableConcept?.text ||
      r.description ||
      r.resourceType;
    const date = (
      r.effectiveDateTime ||
      r.issued ||
      r.date ||
      r.authoredOn ||
      r.recordedDate ||
      r.period?.start ||
      new Date().toISOString()
    ).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    records.push({
      id: id(),
      externalId: r.id ? `${r.resourceType}/${r.id}` : hash(JSON.stringify(r)),
      title: String(title).slice(0, 200),
      type,
      date,
      provider:
        r.performer?.[0]?.display ||
        r.author?.[0]?.display ||
        "Hospital import",
      condition: r.code?.text || "",
      notes: [
        r.conclusion,
        r.valueQuantity
          ? `${r.valueQuantity.value} ${r.valueQuantity.unit || ""}`
          : "",
        ...(r.note || []).map((n) => n.text),
      ]
        .filter(Boolean)
        .join("\n"),
      file: null,
      version: 1,
    });
  }
  return records;
}
