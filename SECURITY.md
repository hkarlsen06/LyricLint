# Security Policy

## Supported versions

LyricLint supports only the current production deployment at
[lyriclint.com](https://lyriclint.com) and the corresponding latest commit on
the `main` branch.

| Version                                          | Supported |
| ------------------------------------------------ | --------- |
| Current production / latest `main`               | Yes       |
| Older deployments, historical commits, and forks | No        |

## Reporting a vulnerability

Please report suspected vulnerabilities through
[GitHub's private vulnerability reporting](https://github.com/hkarlsen06/LyricLint/security/advisories/new).
Do not open a public issue or discussion for an unpatched vulnerability.

Include as much of the following as possible:

- The affected component, commit, or URL
- A description of the vulnerability and its potential impact
- Reproduction steps or a minimal proof of concept
- Any prerequisites or special configuration needed to reproduce it
- A suggested remediation, if you have one

We will:

- Acknowledge the report within 3 business days
- Provide an initial assessment within 7 business days
- Send material status updates at least every 14 days while the issue remains
  unresolved
- Prioritize remediation according to severity, impact, and complexity

Confirmed vulnerabilities will be handled through a GitHub Security Advisory.
We will request a CVE when appropriate.

## Scope

Reports are in scope when they affect:

- The LyricLint source repository
- The production deployment at [lyriclint.com](https://lyriclint.com)
- The confidentiality or integrity of locally stored drafts or audio
- The handling of untrusted content
- Credentials, build artifacts, dependencies, or the build and deployment
  pipeline
- LyricLint's interaction with a third-party service when LyricLint handles that
  interaction unsafely

The following systems are not operated by LyricLint and are out of scope:

- Genius
- YouTube and other Google services
- Apple Music
- Spotify
- Cloudflare
- Web browsers
- Upstream dependency infrastructure
- User-operated forks or deployments

Report vulnerabilities in those systems to their respective maintainers. A
vulnerability in LyricLint remains in scope even when it is exposed through an
integration with one of them.

## Coordinated disclosure

Please keep the report and all related details private until we release a fix
or agree on a disclosure date. We generally aim to resolve disclosure within 90
days, but the reporter and maintainers may agree to a different timeline based
on the issue's severity and remediation complexity.

We are happy to credit reporters in the advisory or release notes with their
permission. This project does not operate a bug bounty and cannot guarantee
payment or other compensation.

## Safe harbor

We consider security research conducted under this policy to be authorized and
in good faith. We will not pursue legal action against researchers who follow
this policy, and we will work with them to understand and resolve their
findings.

When testing:

- Use only accounts, content, and data that you own or have explicit permission
  to use.
- Make a good-faith effort to avoid privacy violations, data loss, service
  degradation, and disruption.
- Stop testing and report the issue immediately if you encounter sensitive data
  or gain access to data that is not yours. Do not retain, copy, alter, or
  disclose it.
- Use the minimum access and activity necessary to demonstrate the
  vulnerability, and do not establish persistence.
- Do not perform denial-of-service testing, social engineering, physical
  attacks, automated high-volume scanning, or testing against third-party
  systems.

If you are unsure whether planned research is covered by this policy, contact
us through private vulnerability reporting before proceeding.
