# Security policy

Brain Trails processes EEG recordings and the accounts of the people who make them. We
take reports about its security seriously and we are grateful for them.

## Reporting a vulnerability

Report it privately through GitHub: on this repository's page open **Security -> Report a
vulnerability**. Only the maintainers see the report, and we can discuss it and agree a fix
with you there. If you cannot use GitHub, write to
**[alessio@lumentis.ca](mailto:alessio@lumentis.ca)**.

Please do **not** open a public issue, pull request or discussion for a vulnerability.

Tell us, as far as you can:

- what is affected (web app, iOS app, console, the headband connection, an upload) and how;
- the steps to reproduce it, or a proof of concept;
- what an attacker could reach: another person's recordings or account, an admin action,
  the infrastructure;
- whether you would like to be credited, and under which name.

Test only against accounts and data that are yours. Do not access, change or delete
other people's data, do not degrade the service for others (no load or denial-of-service
testing), and stop as soon as you have shown the issue. If you follow these rules and give
us a reasonable time to fix the problem before you disclose it, we will not take legal
action against you for your research.

## Supported versions

Only what runs in production is supported: the `main` branch, which is deployed on every
merge, and the iOS build made from it. `beta` and `dev` are pre-release environments; a
finding there is welcome, but it is fixed on its way to `main`, not as a separate release.

| Version             | Supported |
| ------------------- | --------- |
| `main` (production) | yes       |
| anything else       | no        |

## What happens next

| Step                                          | Time                                        |
| --------------------------------------------- | ------------------------------------------- |
| We acknowledge your report                    | within 3 business days                      |
| First assessment (confirmed or not, severity) | within 10 business days                     |
| Fix in production, critical                   | within 7 days of confirmation               |
| Fix in production, high                       | within 30 days                              |
| Fix in production, medium and low             | within 90 days, or the next planned release |

We keep you informed along the way and tell you when the fix is live. We ask you to
keep the details private until then, or for 90 days from your report, whichever comes
first; if we need longer we will say why and agree a date with you.

## Out of scope

- Vulnerabilities in third-party services we use (hosting, email, the Muse headband and its
  firmware): please report them to their vendor. Tell us too if they affect Brain Trails.
- Reports from automated scanners with no demonstrated impact, missing best-practice
  headers alone, social engineering, and physical attacks.

## How we keep the supply chain in check

Every production release produces a CycloneDX software bill of materials of the runtime
dependencies (app and console) and scans them for known vulnerabilities, together with a
CodeQL analysis of our own code (`.github/workflows/release-security.yml`). The SBOM and
the scan are kept with the release run for 90 days; CodeQL alerts stay in the Security
tab until they are fixed or dismissed with a reason. The tab opens on the default branch,
`dev`; the alerts of what runs in production are under the `branch:main` filter.
