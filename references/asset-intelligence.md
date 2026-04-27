# Asset Intelligence

External assets are first-class findings. They often reveal the deployment, development, and operations surface of a JS project.

## Categories

- `repository`: GitLab, GitHub, Gitee, Bitbucket, package registry, source links.
- `download`: APK, IPA, H5 package, QR code, update package, app market link.
- `config_center`: Nacos, Apollo, Consul, etcd, Spring Cloud Config.
- `service_discovery`: Eureka, Consul, Kubernetes service names, gateway hints.
- `api_docs`: Swagger, OpenAPI, Knife4j, Redoc, YApi, Apifox.
- `storage_cdn`: OSS, COS, S3, Qiniu, MinIO, Upyun, CDN, bucket/region.
- `ci_cd`: Jenkins, GitLab CI, GitHub Actions, Harbor, SonarQube.
- `monitoring`: Sentry, Bugly, Firebase, LogRocket, Grafana, Prometheus.
- `webhook`: DingTalk, Feishu, WeCom, Slack webhooks.
- `third_party`: payment, map, captcha, SMS, push, analytics, IM, OCR, risk control.

## Signals

Look for URLs, domains, IP:port pairs, appids, SDK keys, DSNs, bucket names, source-map local paths, build banners, comments, package metadata, and error messages.

Preserve original values by default and attach evidence.
