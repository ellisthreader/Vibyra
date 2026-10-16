# Deployed Cloud VM runtime source (image 9b3f4d71)

Exact `/opt/vibyra/src` of `registry.fly.io/vibyra-cloud-runtime@sha256:9b3f4d71802436accc19d3633956f41c7216aeef2a81094f6b93edb2a0b2ba18`
(the default Cloud runtime image from backend e6050983). All 43 files here match the SHA-256 values in
`../20261016-shutdown-hardening/verification-manifest.json`. This is an archive for audit and reproduction: it is not wired
into `cloud-runtime/Dockerfile`, whose `src/` is an older hosted-project supervisor. Before changing the runtime, start from
these files, not from `cloud-runtime/src`.
