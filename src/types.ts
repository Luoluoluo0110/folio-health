export type RecordType =
  "Lab result" | "Visit summary" | "Prescription" | "Imaging" | "Allergy";
export type HealthRecord = {
  id: string;
  title: string;
  type: RecordType;
  date: string;
  provider: string;
  condition: string;
  notes: string;
  file: { name: string; data: string } | null;
  version: number;
};
export type Metric = {
  id: string;
  date: string;
  systolic: number;
  diastolic: number;
  glucose: number;
  heartRate: number;
};
export type MetricKey = "systolic" | "glucose" | "heartRate";
export type Grant = {
  id: string;
  recipient: string;
  email: string;
  role: string;
  types: RecordType[];
  from: string;
  to: string;
  expires: string;
  editable: boolean;
  lockAllergies: boolean;
  revoked: boolean;
  active: boolean;
};
export type Entry = {
  id: string;
  timestamp: string;
  title: string;
  detail: string;
  before?: unknown;
  snapshot?: unknown;
};
export type Log = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  detail: string;
  location: string;
};
export type State = {
  profile: Record<string, string>;
  records: HealthRecord[];
  metrics: Metric[];
  targets: Record<MetricKey, { min: number; max: number }>;
  grants: Grant[];
  history: Entry[];
  logs: Log[];
  settings: { social: boolean };
  passkeys: { id: string; name: string }[];
};
