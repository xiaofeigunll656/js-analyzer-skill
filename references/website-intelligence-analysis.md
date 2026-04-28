# Website and Intelligence Analysis

During the AI-led review, use these perspectives to enrich `project-report.md`. Do not produce extra summary files by default.

## Website Analyst Summary

Answer:

- What does the website/app do?
- What pages/routes/features exist?
- Which lazy chunks and source maps are missing or recovered?
- Which user journeys are visible: login, registration, account center, search, order, payment, reports, downloads, admin?
- Which APIs support each journey?
- What browser-side architecture exists: publicPath, service worker, CORS/CSP clues, WebSocket, GraphQL, upload/download?

Where to put it:

- Summarize confirmed website/app behavior inside `project-report.md`.
- Put weak chunk/source-map/API leads in `不确定项/待复核`.
- Generate diagrams or structured exports only when the user explicitly asks.

## Intelligence Analyst Summary

Answer:

- What related domains, subdomains, IPs, ports, buckets, CDNs, repos, and operations systems appear?
- Who appears to build or operate the project?
- Which third-party services and SDKs are integrated?
- Which environments exist and how are they named?
- Which findings deserve follow-up because they connect code to real infrastructure?

Where to put it:

- Summarize external assets, developer signals, operations signals, third-party services, and configs inside `project-report.md`.
- Keep scratch helper outputs out of the deliverable list.

Keep claims evidence-based. Treat output as an authorized analysis aid, not as instructions to attack systems.
