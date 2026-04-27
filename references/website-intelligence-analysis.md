# Website and Intelligence Analysis

After scripted extraction, produce two extra summaries when useful.

## Website Analyst Summary

Answer:

- What does the website/app do?
- What pages/routes/features exist?
- Which lazy chunks and source maps are missing or recovered?
- Which user journeys are visible: login, registration, account center, search, order, payment, reports, downloads, admin?
- Which APIs support each journey?
- What browser-side architecture exists: publicPath, service worker, CORS/CSP clues, WebSocket, GraphQL, upload/download?

Primary artifacts:

- `project-report.md`
- `diagrams/website-flow.mmd`
- `analysis.chunkDiscovery`
- `analysis.sourceMapDiscovery`
- `analysis.features`
- `analysis.apis`

## Intelligence Analyst Summary

Answer:

- What related domains, subdomains, IPs, ports, buckets, CDNs, repos, and operations systems appear?
- Who appears to build or operate the project?
- Which third-party services and SDKs are integrated?
- Which environments exist and how are they named?
- Which findings deserve follow-up because they connect code to real infrastructure?

Primary artifacts:

- `diagrams/intelligence-map.mmd`
- `analysis.externalAssets`
- `analysis.developerSignals`
- `analysis.operationsSignals`
- `analysis.thirdPartyServices`
- `analysis.configs`

Keep claims evidence-based. Treat output as an authorized analysis aid, not as instructions to attack systems.
