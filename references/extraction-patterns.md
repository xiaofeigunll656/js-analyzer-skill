# Extraction Patterns

## Request APIs

Search for these calls and wrappers:

- `fetch(url, options)`
- `axios.get/post/put/delete/patch(url, config)`
- `axios({ url, method, data, params, headers })`
- `XMLHttpRequest.open(method, url)`
- `wx.request({ url, method, data, header })`
- `uni.request({ url, method, data, header })`
- `Taro.request({ url, method, data, header })`
- wrappers named `request`, `http`, `service`, `api`, `ajax`, `client`, `httpClient`
- obfuscated bundle wrapper call sites: `Object(alias)("/path", data)`, `s("/path", data)`, `g["a"]("/path", data)`, `this.$ajaxRequest("/path", data)`
- interceptors: `axios.interceptors.request`, `axios.interceptors.response`

## URL Construction

Track:

- `baseURL`, `baseUrl`, `apiBase`, `host`, `domain`, `gateway`, `prefix`
- template strings and concatenation
- environment maps: `dev`, `test`, `stage`, `pre`, `prod`
- request prefixes and route constants
- strong backend-looking path literals with prefixes such as `/api`, `/webapi`, `/auth`, `/authStaff`, `/logout`, `/file`, `/pageHits`, `/upload`, `/download`, `/report`, `/user`, `/staff`, `/resource`, `/role`, and `/permission`

## Parameters

Collect nearby object keys named:

- `params`, `query`, `data`, `body`, `payload`, `formData`
- `headers`, `header`, `Authorization`, `token`, `access_token`, `timestamp`, `nonce`, `sign`, `signature`

When exact values are unknown, create mock values from key names and mark confidence lower.

## Storage and Auth

Search:

- `localStorage`, `sessionStorage`, `wx.getStorage`, `wx.setStorage`, `uni.getStorage`, cookies
- `Authorization`, `Bearer`, `token`, `refreshToken`, `jwt`, `sid`, `session`, `tenantId`, `orgId`

## WeChat Mini Program

Read:

- `app.json` pages, subpackages, plugins, permission, requiredPrivateInfos
- `project.config.json` appid, projectname, compileType
- `ext.json` third-party platform config
- `sitemap.json`, cloud env ids, request/upload/download domain hints
