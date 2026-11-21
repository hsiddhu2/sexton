# Sexton and the Well-Architected pillars

This is a short review of the release 0.1 deployment against the six pillars of the AWS Well-Architected Framework. Each pillar gets one paragraph on what we did and what we traded away. The details are in `docs/architecture.md`, `docs/threat-model.md` and `.kiro/specs/infra/design.md`.

## Operational excellence

Everything is code. One CDK app in `infra/` defines both stacks, and the tests synthesise it with no AWS credentials. Every change is checked by CDK assertions, an IAM-shape test and the cdk-nag AwsSolutions rules. A finding we do not fix must be acknowledged in code with a written reason. A test checks that the same reason appears in the design file. The plan for logs is one JSON line per upstream request with a correlation ID on every line, kept for 30 days. Five alarms send email through SNS. The trade-off is that there is one stage, `dev`, and CI does not deploy. A person runs the deploy by hand.

## Security

The public entry is CloudFront with WAF in front. WAF runs two AWS managed rule groups and a per-IP rate limit on the API. The function URL uses IAM auth, so only CloudFront can call it. Each function has its own role with inline statements only, and no role can update or delete a snapshot. Everything read from a scanned repository is treated as untrusted data. The trade-off is the TLS policy. With the default CloudFront certificate the minimum is TLS 1.0, and raising it needs a custom domain. We accepted that for release 0.1, and the threat model lists the steps to fix it.

## Reliability

A failed upstream call while scoring degrades one signal for one package and never fails the whole scan. A missing manifest or an unreadable policy file does fail the scan, with a clear error. The plan is that a failed cache or history read in DynamoDB degrades the same way. The snapshot table has point-in-time recovery, deletion protection and a retain policy, so the history survives a bad deploy or a stack delete. The snapshotter stops before its timeout and reports what it did not reach. A slow day then shows up as an alarm instead of silent gaps. The trade-off is one region. If us-east-1 is down, the demo is down.

## Performance efficiency

The goal is a 50-dependency scan in under 20 seconds warm and under 60 seconds cold. The 24-hour cache in DynamoDB is shared by every Lambda container, so a warm scan reads most signals from the cache instead of the network. Cache values are gzipped to fit more of the big npm documents under the item size limit. We skipped API Gateway because an HTTP API stops waiting at 30 seconds. CloudFront can wait 60 seconds for a function URL. Both functions run on arm64 with 1024 MB. These targets are not measured yet. They get checked on the first deploy.

## Cost optimization

Everything is on demand. The only fixed monthly costs are the WAF web ACL with its rules and the Secrets Manager placeholder. The estimate is about 8.40 USD a month at zero traffic and about 15.80 USD a month at 1000 scans a day. The product target is under 20 USD. WAF is the biggest fixed cost at 8 USD a month. We keep it because a public scan endpoint with no rate limit invites abuse. Reserved concurrency of 10 on the scan function caps how much a burst can spend. CloudFront tries the API once, so a slow scan is never run twice.

## Sustainability

Sexton does work only when someone asks for a scan, plus one short job a day. The functions run on Graviton (arm64). AWS says Graviton uses up to 60% less energy than x86 for the same performance. The source is https://aws.amazon.com/blogs/apn/comparing-aws-lambda-arm-vs-x86-performance-cost-and-analysis-2/. The shared cache means the same npm document is not downloaded again for every visitor. Old cache items expire through DynamoDB TTL, and the price class limits CloudFront to its lowest-cost edge locations.
