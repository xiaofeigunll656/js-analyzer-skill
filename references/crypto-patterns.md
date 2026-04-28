# Crypto Patterns

Model shared crypto/signature logic once and reference it from APIs/features.

## Detect

Search for:

- `CryptoJS`, `crypto.createHash`, `crypto.createHmac`, `crypto.subtle`, `JSEncrypt`
- `md5`, `sha1`, `sha256`, `sha512`, `hmac`, `rsa`, `aes`, `des`, `base64`
- `sm2`, `sm3`, `sm4`, `gmssl`, `sm-crypto`
- `atob`, `btoa`, `Buffer.from(..., "base64")`
- `encodeURIComponent`, custom canonicalization, sorted query signing
- keys named `secret`, `appSecret`, `ak`, `sk`, `privateKey`, `publicKey`, `salt`, `iv`

## Record

For each finding:

- Algorithm and library.
- Mode/padding when visible.
- Key, IV, salt, timestamp, nonce, and signature field sources.
- Canonical string construction order.
- Call sites and APIs that depend on it.
- Generated Node.js helper path if a reusable helper is produced.
- Test vector if a literal input/output is available.

## Optional Helper Script

Generate a helper only when the crypto/signature path is confirmed and useful for the user to call. Keep output minimal:

- Prefer one `crypto-helper.mjs` with subcommands such as `sign`, `encrypt-request`, or `decrypt-response`.
- Prefer Node.js standard library (`node:crypto`, `Buffer`, `URLSearchParams`) when it matches the project behavior.
- If the project uses SM2/SM3/SM4 or another non-standard dependency, either import the same npm package and document `npm install`, or state in the report that the helper is blocked by an unconfirmed dependency.
- Do not invent keys, IVs, salts, padding, canonicalization order, or response fields. Require CLI flags or environment variables for dynamic/secret values.
- Put usage in `project-report.md`, including where the flow is called and one command example per supported subcommand.

## Do Not Guess

If only a variable named `sign` is visible, record an uncertainty. If code shows sorted parameter concatenation plus hash/HMAC, record the construction with evidence.
