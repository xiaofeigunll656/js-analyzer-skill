# Perspective Checklists

Use these checklists during the AI-led review and again before final reporting. They guide Codex's manual reasoning and help decide what is still missing from the report. Scripted extraction, when used, is only one input.

## Intelligence Analyst

Extract and correlate:

- Domains, subdomains, IPs, ports, CDNs, object-storage buckets, and cloud regions.
- Organization names, department names, people, emails, phones, source-map local paths, build users, package authors.
- Repository links, private registries, CI/CD endpoints, issue/wiki/project-management systems.
- Third-party relationships: analytics, customer service, captcha, SMS, push, payment, map, IM, monitoring.
- Environment topology: dev/test/stage/pre/prod naming, gateways, config centers, service discovery.

Output should answer: who appears to own/build/operate this project, what sites and services are related, and which assets deserve follow-up.

## Website Analyst

Extract and explain:

- Route map, page titles, lazy chunks, public paths, source maps, webview/H5 entrypoints.
- User journeys: login, registration, account center, search, order/payment, reports, downloads, admin pages.
- Analytics/AB testing/event names and business funnel hints.
- Static resources, CDN strategy, version/update checks, APK/IPA/H5 distribution.
- Browser-side constraints: CORS hints, CSP/meta tags, service worker, cache/publicPath.

Output should answer: what the website does, what pages exist, what flows a normal user can perform, and what code/files power those flows.

## Project Architect

Extract and explain:

- Framework, build tool, package manager, routing, state management, request layer, component/page structure.
- Module boundaries, feature ownership, API dependency graph, shared utilities, crypto/signature layer.
- Environment/config architecture and deployment assumptions.
- Bundle architecture: runtime, vendor chunks, route chunks, dynamic imports, source-map coverage.
- Integration architecture: auth, payment, storage, monitoring, config center, gateway, service discovery.

Output should answer: how the project is built, how modules depend on each other, and where the high-leverage files are.

## Senior Developer

Extract and review:

- Request wrapper behavior: base URL selection, headers, token refresh, error handling, retry, timeout, interceptors.
- Data contracts: request/response shapes, enum/error codes, permission codes, form schemas, validation rules.
- Technical debt: duplicated wrappers, hardcoded secrets, debug flags, dead endpoints, fragile dynamic URL construction.
- Maintainability: naming conventions, i18n usage, state management, shared utilities, generated code, source maps.
- Local reproduction hints: scripts, env files, default users, mock endpoints, build modes.

Output should answer: what a developer must know to maintain or extend this project safely.

## Normal User

Extract and explain:

- Visible features, page names, menu labels, button labels, user roles, account flows.
- Required inputs and outputs for common workflows.
- Download/update links, help/customer-service links, error messages, permission prompts.
- Default/test accounts only when present in the code.

Output should answer: what a first-time user can do in the app and what the main business purpose appears to be.

## Authorized Pentest Engineer

Use only for projects the user is authorized to assess. Do not provide exploitation instructions against third-party systems.

Extract and prioritize:

- Complete endpoint inventory, hidden/admin routes, role/permission codes, feature flags, debug/test switches.
- Auth/session details: token names, refresh flows, tenant/org IDs, cookie/storage keys, CORS/CSP clues.
- Secrets and defaults: ak/sk, app secrets, API keys, default/test accounts, hardcoded passwords, public/private keys.
- Crypto/signature logic: algorithms, canonicalization, timestamp/nonce rules, replay protections, shared helpers.
- Input surfaces: upload/download, file preview, redirects, webview bridges, URL parameters, GraphQL, WebSocket, MQTT.
- Supply-chain and operations surface: source maps, internal repos, config centers, Swagger/Knife4j/YApi/Apifox, CI/CD, monitoring DSNs.
- Risk notes should be evidence-based and phrased as findings/leads, not as attack steps.

Output should answer: what assets and code paths need authorized security review, what evidence supports each lead, and what remains uncertain.
