# Consent Text for the App

These texts should appear in the app before the first EEG recording. Consent controls should be clear, separate, unticked by default where consent is optional, recorded with a timestamp and policy/consent version, and withdrawable through account settings or privacy@lumentis.ca.

## Required EEG processing acknowledgement / consent

> **EEG assessment and core Service processing**
>
> Lumentis will collect and process my EEG recordings, exercise responses, and related technical information to provide my assessment results, metrics, visualizations, and reports; maintain and secure the Service; assess signal quality; troubleshoot technical issues; and evaluate, validate, and improve the accuracy, reliability, safety, and performance of the Lumentis features and metrics provided through the Service.
>
> I understand that Lumentis uses pseudonymized identifiers where reasonably practicable and stores and processes Service data primarily in Frankfurt, Germany. I have read the Privacy Policy.

**Control:** Required affirmative checkbox or similarly clear affirmative consent action before the user begins EEG capture, where required by law.

## Optional broader research consent

> **Optional research contribution**
>
> I agree that Lumentis may retain and use my pseudonymized or de-identified EEG recordings, derived EEG features, assessment responses, and related information for broader scientific research and research and development beyond operating and improving the current Lumentis Service. This may include research intended to advance knowledge and tools in mental health, neurology, psychiatry, neuroscience, cognitive science, and related fields, as well as developing, training, validating, and evaluating future analytical methods, models, and products.
>
> My choice will not affect my ability to use the core Lumentis Service. I can withdraw this research consent at any time through account controls or by contacting privacy@lumentis.ca. Withdrawal will apply to future research uses of information that remains identifiable or reasonably linkable to me and cannot reverse research already completed or remove information that has been irreversibly anonymized.

**Control:** Separate, optional, **unticked-by-default** checkbox. A user must be able to proceed with the full core Service after declining it.

---

# Privacy Implementation Protocols for Claude Code

## Role and scope

You are implementing privacy, security, consent, retention, and user-rights controls for the Lumentis web application. The product processes raw EEG recordings from compatible headbands, derived EEG features, task/exercise responses, reports, and account information.

Lumentis is a Canadian corporation. Production Service data are intended to reside primarily in Frankfurt, Germany. The existing stack includes Amazon S3 with SSE-S3 encryption, Neon/PostgreSQL with encryption at rest, and TLS 1.2/1.3 for data in transit.

Do **not** introduce major architectural changes, replace core vendors, redesign the user experience wholesale, or claim legal compliance in code or user interfaces. Build pragmatic, incremental controls around the existing application. Prefer small, reviewable migrations and feature flags. Preserve existing functionality unless a change is necessary for privacy or security.

## Non-negotiable implementation principles

1. Treat raw EEG, derived EEG features, task responses, reports, account IDs, emails, IP addresses, and any data that can reasonably be linked to a user as personal information.
2. Treat production EEG data as pseudonymized—not anonymous—unless a separate reviewed anonymization pipeline is explicitly implemented.
3. Keep direct identifiers separate from EEG/session/analysis records wherever feasible in the current schema.
4. Enforce least-privilege access, default-deny authorization, auditability, and data minimization.
5. Do not add third-party analytics, session-recording, ad-tech, tracking pixels, crash-reporting SDKs, or telemetry that could receive EEG, report, health-related, or account data without explicit written approval.
6. Never put raw EEG, derived EEG features, report content, email addresses, names, bearer tokens, cookies, passwords, reset tokens, or participant-ID mappings in client-visible logs, server logs, error messages, analytics events, URLs, query strings, browser local storage, or source control.
7. Do not store authentication tokens, user identity, or EEG records in cookies or local storage except for the minimum secure session mechanism already required by the application.
8. Use configuration and environment variables for secrets. Never commit secrets, private keys, database URLs, AWS credentials, or production identifiers to source control.
9. Implement each change with tests, migration safety, and concise operator documentation.

## Deliverables

Implement the following capabilities without a major architectural rewrite:

1. Consent registry and consent-aware data access.
2. Pseudonymous participant/session identifiers and separation of direct identifiers.
3. Research eligibility controls.
4. Retention classification and a safe archival/deletion workflow.
5. Privacy-request workflow for access, export, withdrawal, and deletion.
6. Security hardening and sensitive-data logging controls.
7. Audit trails for privileged or sensitive actions.
8. Internal configuration and documentation to validate Frankfurt-region data residency.

Produce:

- Database migrations.
- Backend/API implementation.
- Minimal UI for account privacy controls.
- Background-job or administrative commands for archival/deletion where the current application supports them.
- Automated tests for authorization, consent enforcement, and deletion/withdrawal behavior.
- A short `PRIVACY_OPERATIONS.md` document for operators.
- A short `DATA_FLOW_AND_RESIDENCY.md` document identifying known/unknown data locations and vendors; mark uncertainties explicitly rather than guessing.

## 1. Data model changes

Use the application’s existing naming conventions and ORM/migration framework. Add only fields/tables that are necessary.

### 1.1 Stable pseudonymous IDs

Ensure every user/account has a server-generated, high-entropy, non-sequential `participant_id` (for example UUIDv4 or a cryptographically secure random ID). Do not expose internal numeric primary keys in URLs, APIs, exports, or client payloads.

Requirements:

- `participant_id` must not encode email, name, date of birth, timestamps, or other user attributes.
- EEG recordings, derived features, sessions, task responses, and reports should reference `participant_id` or a user-internal foreign key, not an email address or display name.
- Keep account identity fields in the account/user table; do not duplicate direct identity fields in EEG/session/report tables.
- If a mapping already exists between user and participant ID, restrict direct querying of that mapping to backend services and approved administrative workflows.

### 1.2 Consent registry

Create a consent table or equivalent append-only consent-event model. A recommended schema is:

```text
consent_records
- id
- user_id (foreign key)
- participant_id (optional duplicated reference only if required for efficient research gating)
- consent_type: core_eeg_processing | optional_research | marketing
- status: granted | declined | withdrawn
- policy_version
- consent_text_version
- jurisdiction_or_country (nullable)
- collected_at
- withdrawn_at (nullable)
- source: onboarding | settings | privacy_request | admin
- actor_user_id (nullable; null for self-service/system actions)
- metadata_json (minimal; never put EEG, identity, or free-text content here)
```

Requirements:

- Do not overwrite consent history. Record a new event when a user grants, declines, or withdraws consent.
- The effective consent state must be derived deterministically from the latest valid event for a consent type.
- Record the exact policy version and consent-text version shown to the user.
- Consent must be explicit and auditable. Do not infer optional research consent from account creation, app use, or a preselected checkbox.
- Core EEG processing should be recorded before any raw EEG upload begins if the applicable product flow requires consent.
- Optional research consent must default to `declined` or absent; only an affirmative user action can set it to `granted`.

### 1.3 Data classification fields

Add minimal metadata needed to govern retention and access. Prefer an existing metadata system if one already exists.

For each EEG recording/session/report, track:

```text
- created_at
- participant_id
- storage_class: active | cold | pending_deletion | deleted
- research_eligibility: no_consent | eligible | withdrawn | excluded
- research_eligibility_updated_at
- deletion_requested_at (nullable)
- deleted_at (nullable)
```

Do not copy direct identifiers into these records.

## 2. Consent-aware behavior

### 2.1 Core EEG processing gate

Before beginning a first EEG recording, require the user to view the current Privacy Policy and complete the required core EEG processing acknowledgement/consent flow if it is required for their jurisdiction/product flow.

Implementation requirements:

- Version the consent text in code/configuration.
- Display a link to the Privacy Policy.
- Store a consent event with time, policy version, and consent-text version.
- Block EEG-recording initiation and raw EEG upload when the required consent state is not granted.
- Do not use pre-checked boxes.
- If core consent is withdrawn, disable future recordings and report generation that require the processing, explain the effect clearly, and preserve the withdrawal event.

### 2.2 Optional research gate

Implement a separate, optional research choice in onboarding and account privacy settings.

Requirements:

- The optional research switch/checkbox must be off by default.
- Declining research must not block EEG collection, report generation, existing reports, or core product functionality.
- Granting research consent marks only data permitted under the documented policy as `research_eligibility = eligible`.
- Withdrawing research consent immediately prevents the user’s still-linkable records from entering any future research export, research job, model-training job, or research-oriented analysis.
- Existing research jobs must query eligibility at runtime or use a regularly refreshed allowlist; do not rely on a one-time export that cannot honour withdrawal.
- Do not automatically retroactively label old sessions as research eligible unless the user’s consent language clearly covers those sessions and the product/legal owner approves the behavior.

### 2.3 Research access control

Create an explicit research dataset/query layer or service role rather than giving research jobs unrestricted access to production tables.

Minimum approach without major architecture changes:

- Create a restricted database view, query function, or service layer that exposes only research-eligible pseudonymous records.
- Exclude direct account fields: name, email, phone, IP address, authentication data, support messages, billing fields, and the account-to-participant mapping.
- Exclude raw application logs, user-agent strings, exact IPs, secrets, and administrative notes.
- Require `optional_research` effective status to equal `granted` and `research_eligibility` to equal `eligible`.
- Ensure all research job code uses this restricted layer. Add tests that prove users without consent and users who withdrew consent cannot appear in research queries.
- Do not create a public dataset or external sharing/export function.

## 3. Retention, cold storage, and deletion

### 3.1 Retention configuration

Implement retention periods as configuration values, not hard-coded assumptions. Provide defaults that match the stated policy only after product-owner approval:

```text
RAW_EEG_ACTIVE_RETENTION_DAYS=60
RAW_EEG_COLD_ARCHIVE_AFTER_DAYS=60
BACKUP_RETENTION_DAYS=[CONFIGURE]
SECURITY_LOG_RETENTION_DAYS=[CONFIGURE]
DELETION_GRACE_PERIOD_DAYS=[CONFIGURE]
```

Do not claim that a workflow has been implemented until the relevant configuration, scheduled job, and verification test exist.

### 3.2 Cold archival

Implement or document a scheduled task that identifies raw EEG objects older than the configured active retention period and transitions them to the existing approved cold-storage mechanism.

Requirements:

- Preserve access controls and encryption when archived.
- Keep a database metadata record sufficient to find the object for authorized user access or a verified deletion request.
- Do not treat archival as deletion.
- Do not move data across regions.
- Record success/failure and retry safely.
- If S3 lifecycle policies already do this, document the bucket, prefix, rule identifier, transition timing, storage class, and verification process rather than duplicating it in application code.

### 3.3 Deletion request workflow

Build a minimal, safe workflow that supports account deletion and privacy deletion requests.

Required stages:

1. Receive deletion request through account settings or an internal privacy request queue.
2. Verify requester identity before destructive action.
3. Mark the account and linked data as `pending_deletion`; immediately revoke sessions/tokens and stop future processing where appropriate.
4. Prevent pending-deletion records from being used in future research, analytics, exports, or model-training jobs.
5. Delete or queue deletion of live account identity data, raw EEG objects, derived features, reports, and participant mappings according to the approved retention rules.
6. Record completion status, timestamps, failures, and any limited categories retained under an approved legal/security/backup exception.
7. Handle backups through their normal lifecycle; do not attempt unsafe ad hoc backup modification. Document the expected backup-expiry window.

Additional requirements:

- Use idempotent jobs so retries do not recreate, partially delete, or corrupt data.
- Use soft-delete/pending state only for the approved grace period; perform hard deletion after the grace period unless retention rules require otherwise.
- Do not delete audit records necessary to demonstrate consent withdrawal and deletion handling; minimize their content and retain only what is necessary.
- Do not claim that anonymous data can be located and deleted. For still-linkable optional-research data, withdrawal must prevent future use and trigger deletion/exclusion consistent with the approved research protocol.

### 3.4 User-facing privacy controls

Add a minimal privacy section in account settings with:

- Current optional-research consent state.
- A clear control to grant or withdraw optional research consent.
- A link to the current Privacy Policy.
- A request-data-export action or a clear request form.
- A request-account-deletion action with confirmation and explanation that deletion may remove access to reports and future assessments.
- A contact link: `privacy@lumentis.ca`.

Do not expose internal participant IDs, raw storage paths, infrastructure details, or security logs to users.

## 4. Data export and access requests

Implement a privacy export that can be generated after authenticated request and appropriate verification.

Export scope should include, where feasible:

- Account profile fields stored by Lumentis.
- Consent history relevant to that user.
- Session metadata.
- User-facing reports and derived metrics that the user can access.
- A machine-readable index of raw EEG recordings or raw files where providing them is technically practical and safe.

Requirements:

- Create a temporary, access-controlled export artifact with a short expiry.
- Encrypt export files at rest and require authenticated download.
- Avoid including secrets, internal risk signals, other users’ data, server logs, source code, database connection information, or internal security rules.
- Log export creation, download, expiration, and deletion.
- Do not email raw EEG or a permanent public download URL.

## 5. Security hardening

### 5.1 Authentication and authorization

Review and enforce:

- Secure, HTTP-only, `Secure`, and appropriately scoped session cookies.
- `SameSite=Lax` or stricter where compatible with the app flow.
- Short-lived sessions and token rotation where supported by the existing authentication system.
- Server-side authorization checks on every endpoint that reads, modifies, downloads, exports, or deletes EEG/session/report data.
- Object-level authorization: a user can access only their own records; users must not access data by changing IDs in URLs or API requests.
- Separate privileged/admin roles from normal user roles.
- Multi-factor authentication for administrative/production access where supported by current providers and operationally feasible.

### 5.2 S3 and object storage

Review existing S3 configuration and document findings. Do not change production settings without review/approval if infrastructure-as-code or deployment management is external to the repository.

Verify or flag the following:

- Bucket region is Frankfurt (`eu-central-1`) if that is the intended production residency.
- S3 Block Public Access is enabled.
- Bucket policies deny non-TLS requests.
- Objects use SSE-S3 as stated, or document the actual encryption configuration.
- IAM permissions use least privilege; client browsers never receive broad bucket credentials.
- Upload/download uses short-lived pre-signed URLs only when necessary, scoped to one object/action and short expiration.
- Object key naming does not include emails, names, or other direct identifiers.
- Versioning, lifecycle, replication, server-access logging, CloudTrail, and backup settings are documented because they affect retention and residency.

### 5.3 Database and application safeguards

- Use parameterized queries or an ORM to prevent SQL injection.
- Ensure database connections require TLS.
- Restrict database credentials by environment and role.
- Do not use production personal data in development, demos, screenshots, or automated test fixtures.
- Add request-size, file-type, and content-validation limits to EEG upload endpoints as appropriate for the existing ingestion flow.
- Rate-limit authentication, export, deletion, and upload endpoints.
- Add CSRF protection for cookie-authenticated state-changing endpoints.
- Use secure headers appropriate to the framework: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, and clickjacking protections.

### 5.4 Logging and observability

Implement a reusable log-redaction utility/middleware and apply it to server logs, error handlers, queues, and telemetry.

Redact or omit:

- EEG payloads and raw signal arrays
- Derived feature vectors and report content
- Names, emails, phone numbers, physical addresses
- Authentication headers, cookies, bearer tokens, API keys, passwords, password-reset tokens
- Full IP addresses where not necessary
- Pre-signed URLs and storage object URLs
- Participant-ID mapping data

Use structured logs with request IDs and minimal pseudonymous references where an identifier is needed for debugging. Ensure exception messages returned to clients are generic and do not leak storage paths, SQL, stack traces, identifiers, or system configuration.

## 6. Audit logging

Implement a security/audit event model for sensitive actions. The audit trail must not contain raw EEG or direct personal data beyond the minimum identifier needed for accountability.

Log:

- Consent grant, decline, and withdrawal
- Creation and completion/failure of data export requests
- Account deletion request, approval, execution, and failure
- Privileged/admin access to identity-to-participant mapping, if such access exists
- Privileged/admin access to raw EEG objects or reports outside normal user access
- Research export/job creation and completion
- Changes to retention configuration or privacy-sensitive feature flags
- Authentication failures and privilege changes

Recommended fields:

```text
audit_events
- id
- occurred_at
- event_type
- actor_type: user | admin | service | system
- actor_id (pseudonymous or internal ID)
- target_type
- target_id (internal/pseudonymous ID where possible)
- request_id
- outcome: success | denied | failure
- reason_code (minimal, controlled vocabulary)
- metadata_json (redacted/minimal)
```

Audit logs should be append-only in normal application use. Do not provide general staff with the ability to edit or delete them.

## 7. Data residency and vendor register

Create `DATA_FLOW_AND_RESIDENCY.md` documenting the actual state of the deployed system. Do not invent facts. Use `CONFIRMED`, `NEEDS_VERIFICATION`, and `NOT_USED` labels.

Include at least:

| System/data category | Vendor/service | Region/location | Data types | Encryption | Access roles | Retention/lifecycle | Status |
|---|---|---|---|---|---|---|---|
| Raw EEG object storage | AWS S3 | [verify] | Raw EEG and session files | SSE-S3 [verify] | [verify] | Active then cold archive | NEEDS_VERIFICATION |
| Application database | Neon/PostgreSQL | [verify] | Account mappings, metadata, consent, reports | AES-256 at rest [verify], TLS in transit | [verify] | [verify] | NEEDS_VERIFICATION |
| Application hosting | [vendor] | [verify] | Requests, runtime processing | [verify] | [verify] | [verify] | NEEDS_VERIFICATION |
| Logs/monitoring | [vendor] | [verify] | Redacted operational logs | [verify] | [verify] | [verify] | NEEDS_VERIFICATION |
| Email/authentication | [vendor] | [verify] | [verify] | [verify] | [verify] | [verify] | NEEDS_VERIFICATION |

Also document:

- All production, staging, test, and development environments.
- All third-party SDKs/packages that transmit data externally.
- S3 replication, backups, object versions, access logs, CloudTrail, database backups, point-in-time recovery, and read replicas.
- Whether any production data can be accessed from Canada or Italy and by which approved roles.

## 8. Privacy operations runbook

Create `PRIVACY_OPERATIONS.md` that contains concise procedures for:

- Responding to an access/export request.
- Responding to a deletion request.
- Processing withdrawal of optional research consent.
- Processing withdrawal of core EEG processing consent.
- Handling a suspected privacy or security incident.
- Verifying that a research query/export includes only eligible records.
- Verifying S3 bucket region, encryption, public-access block, lifecycle rules, and replication settings.
- Verifying Neon/PostgreSQL region, backup/PITR configuration, encryption, and access roles.
- Reviewing privileged access and audit events.

For each runbook, identify: responsible role, required approval, expected timeline, evidence to retain, and escalation path to `privacy@lumentis.ca` / the Privacy Officer.

## 9. Testing requirements

Add automated tests for at least the following:

### Consent tests

- A user cannot start EEG upload/recording when required core consent is absent.
- A user can receive core reports after declining optional research consent.
- Optional research consent is not granted by default.
- Granting optional research consent makes only the permitted records research eligible.
- Withdrawing optional research consent removes/excludes the user from all future research queries/jobs.
- Consent history is append-only and preserves policy/consent versions.

### Authorization tests

- User A cannot retrieve, modify, delete, export, or create a pre-signed URL for User B’s EEG/session/report data.
- A non-admin cannot access administrative mapping or audit endpoints.
- Direct object-storage paths cannot be enumerated or accessed without authorization.

### Deletion tests

- A verified deletion request blocks future processing promptly.
- Pending-deletion records are excluded from research queries.
- A deletion job removes the expected database records and queues/removes associated object-storage records without deleting other users’ data.
- Retained audit events do not contain raw EEG or unnecessary direct identifiers.
- Jobs are idempotent under retry.

### Logging tests

- Representative API failures do not log or return raw EEG, feature vectors, email addresses, auth tokens, cookies, pre-signed URLs, or stack traces.
- Redaction middleware handles nested JSON and common authorization/header fields.

## 10. Explicit non-goals

Do not implement any of the following without a separate written product, security, and legal decision:

- A claim that Lumentis is GDPR-, PIPEDA-, HIPAA-, or BC PIPA-compliant.
- A claim that data are anonymous, irreversibly de-identified, or impossible to re-identify.
- Data sharing with researchers, partners, advertisers, data brokers, or public repositories.
- A public research-data portal.
- New advertising, behavioural tracking, fingerprinting, or cross-site analytics.
- Local browser storage of raw EEG, reports, or identity-to-participant mappings.
- Automatic use of all historical user data for optional research without confirmed consent coverage.
- Major cloud migration, vendor replacement, or redesign of the application’s core ingestion/analysis architecture.

## 11. Completion report

When implementation is complete, provide a concise completion report with:

1. Files changed and migrations added.
2. Consent states and enforcement points implemented.
3. Endpoints and jobs protected or added.
4. Tests added and their results.
5. Confirmed data-residency findings.
6. Unverified vendor/infrastructure facts that require developer or cloud-console confirmation.
7. Known limitations and recommended next steps.
8. Any public-policy language that must be changed because the implementation does not support it.

Do not state that a control is implemented if it is only documented, proposed, mocked, or blocked by missing credentials/infrastructure access.
