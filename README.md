# Folio Health

A personal health-record web app with a minimalist ivory, sage, and teal interface. Built with React 19, TypeScript, Vite, Node.js 24, Express, and SQLite. Charts use Recharts; icons use Lucide. Fonts are bundled locally.

## Start

Use Node.js 24 or later. From this folder:

```powershell
npm ci
npm run build
npm start
```

Open **http://localhost:5173**. Select **Explore the demo** to create an isolated workspace containing fictional records. Each demo session gets a separate account. Or create an account with an email and a password of at least 12 characters to start with an empty workspace.

For development with hot reload, run `npm run dev`. For checks, run `npm test` and `npm run build`.

The server listens on the local loopback interface. It is not publicly deployed. To change the port, set `PORT` and matching `APP_ORIGIN`. Sign-in requires the exact configured origin; use `localhost`, not `127.0.0.1`, in the browser with the default configuration.

## Requirements and implementation

| Requirement from the brief                                           | Implementation                                                                                                                                                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password, SMS, and facial/device login                               | Per-account password authentication, Twilio Verify SMS adapter, and WebAuthn device passkeys. Device capabilities determine whether verification uses face, fingerprint, or PIN. |
| Personal details, conditions, family history, medications, allergies | Editable health profile with saved before/after revisions.                                                                                                                       |
| Health documents and hospital data                                   | Add and edit typed records; attach PDF, PNG, or JPEG reports; import FHIR JSON; optionally fetch the configured hospital patient’s records.                                      |
| Automatic organization                                               | Imported records classified by resource type, deduplicated by external ID, and sorted by date.                                                                                   |
| Revision history                                                     | Before/after snapshots for profile changes and record edits, including shared note edits.                                                                                        |
| Search                                                               | Typo-tolerant text matching across title, type, provider, condition, and notes, combined with type and date filters.                                                             |
| Trends and alerts                                                    | Blood pressure, glucose, and heart-rate charts; 7/30/90-day selectors; editable personal ranges; out-of-range notifications.                                                     |
| Risk and prevention context                                          | Explainable range comparisons and family-history context for discussion with a care team. No clinical risk model, diagnosis, or prescription is claimed.                         |
| Flexible doctor authorization                                        | Record-type and date scope, 1–90-day expiry, optional note editing, allergy edit lock, immediate revocation. Enforced in the API.                                                |
| Access tracking                                                      | Actor label, server timestamp, observed IP/location, and operation details, including shared record reads and edits.                                                             |
| Persistent records and logs                                          | Encrypted SQLite state, WAL journaling, full synchronous durability, downloadable archive.                                                                                       |
| Optional patient social features                                     | Omitted, as the brief explicitly marks them optional. Settings makes the disabled state clear; there is no social-data sharing or messaging.                                     |
| Simple interface                                                     | Six focused sections, guided forms, empty states, keyboard-accessible dialogs, mobile navigation, reduced-motion support.                                                        |

## Provider setup

Copy `.env.example` to `.env`, fill in the relevant values, and run:

```powershell
node --env-file=.env server/index.mjs --production
```

**SMS:** supply `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID`. Set an international phone number in the account profile. Login sends and checks real codes through Twilio Verify. No test code is displayed or accepted locally. Sending SMS can incur charges. Production enrollment should verify phone ownership before enabling SMS sign-in; this starter uses the number saved by the authenticated account owner.

**Device passkeys:** after password sign-in, choose Settings → Device passkey → Set up. WebAuthn uses platform verification and requires a compatible authenticator and secure context (localhost qualifies). Actual biometric verification occurs on the device; the app never receives face or fingerprint data. A face-specific method cannot be guaranteed on every device.

**Hospital sync:** set an approved HTTPS `FHIR_URL`, token, `FHIR_PATIENT_ID`, and `FHIR_ACCOUNT_EMAIL`. The account email must match before data is fetched. The connector requests `Patient/{id}/$everything` and accepts supported FHIR resources. Paginated responses are rejected explicitly to avoid silently presenting an incomplete sync; import a complete FHIR Bundle instead. This is a starter adapter, not a certified universal EHR integration. Provider onboarding, consent, and authentication must be completed with the hospital.

**File import:** use the included `sample-hospital-export.json` to try the workflow. Import it twice to verify duplicate handling. JSON reports preserve available text and quantities; they do not automatically populate measurement charts or fetch remote report attachments. Attach original reports through Add record.

## Sharing behavior

Creating a grant returns a random, time-limited bearer link. No email or message is sent automatically. Share the link privately with its intended recipient. The server stores a hash of the token and checks scope, expiry, revocation, and allergy locks on every request. Shared users can edit notes only when permitted; they cannot change record types, dates, profile fields, or sharing rules.

A link’s recipient label identifies the intended reader, not a verified clinician. Anyone holding the link can exercise its permissions. Production use should add verified recipient accounts, identity checks, and an appropriate consent process.

## Storage and backups

Runtime data is created in `data/` (or `DATA_DIR`). Health state, revisions, and logs are encrypted using AES-256-GCM. Passwords use scrypt with individual salts. Session tokens and sharing tokens are stored as hashes. Cookies are HttpOnly and SameSite Strict, with Secure enabled for HTTPS origins; sessions expire after eight hours.

The local encryption key is stored in `data/encryption.key`. The host’s file permissions remain the security boundary: an attacker with access to both the database and key can decrypt the records. Account email addresses and authentication metadata are not encrypted in this starter.

For a reliable backup, stop the server and copy the **entire data directory**, including `encryption.key`, `folio.sqlite`, and any WAL/SHM files that remain, to a private backup location. Restore that directory while the server is stopped. Losing the encryption key makes the health records unrecoverable. Never replace an existing data directory without first backing it up.

Settings → Export downloads a readable JSON archive of health records, measurements, history, and logs. The export is unencrypted and should be stored privately. Passkey secrets and authentication credentials are not included. This JSON export is for portability; it is not an in-app restore format.

## Validation

The automated suite checks authentication, account separation, rejected cross-origin writes, record revision preservation, valid measurement input, scoped access, allergy locks, authorized note edits, expiry, revocation, FHIR deduplication, export, absent-provider behavior, passkey registration options, and absence of plaintext health-record content in SQLite and its WAL.

Browser checks cover the demo dashboard, adding records, typo-tolerant search, and responsive layouts. Hardware passkey completion, paid SMS delivery, and a real hospital connection require their respective external devices or providers and were not end-to-end verified here.

## Before real-world deployment

This is a functional local application and integration starter, not a certified medical service. It does not guarantee regulatory compliance or prevent every form of data loss. Deployment with real patient data needs verified phone enrollment and recipient identities, account recovery, email verification, managed key storage, tested automated backups and restore, independent security review, HTTPS, appropriate monitoring, clinical validation of any risk logic, and the applicable privacy and consent controls.

The implementation uses a widely adopted JavaScript stack; [Stack Overflow’s 2025 technology survey](https://survey.stackoverflow.co/2025/technology) documents broad use of React and Node.js. [Vite’s official guide](https://vite.dev/guide/) covers the frontend toolchain.

## Project layout

```text
src/main.tsx                Application screens and forms
src/styles.css              Responsive visual design
src/types.ts                Shared frontend types
server/index.mjs            Authenticated API, encryption, provider adapters
server/model.mjs            Data model, permissions, search, FHIR import
tests/                      Model and API integration checks
sample-hospital-export.json Sample import
.env.example                Optional provider configuration
```
