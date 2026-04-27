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
- Generated Node.js and Python helper paths.
- Test vector if a literal input/output is available.

## Do Not Guess

If only a variable named `sign` is visible, record an uncertainty. If code shows sorted parameter concatenation plus hash/HMAC, record the construction with evidence.
