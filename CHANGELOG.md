# Changelog

## 0.1.1 - 2026-09-30

### Signing and automation

- Add the dedicated Ed25519 release public key and a repository Actions signing secret.
- Build only committed Git source; sign the catalog, component manifests, complete release file list and archive digest.
- Add public-key verification tools and tests for altered payloads, wrong keys, signature purpose substitution, unsafe paths and modified release files.
- Add secret-free pull request checks, manual signed artifacts, and version-tag-triggered GitHub Releases.
- Document key backup, GitHub Secret setup, exact signature bytes and consumer verification. No anti-rollback or expiration policy is implemented.
- Runtime loaders remain at 0.1.0 and do not yet enforce signature verification; this patch covers publishing tools, not device security acceptance.

## 0.1.0 - 2026-09-30

### Framework

- Add portable manifest/path/version validation, cancellation tokens and stable error codes.
- Add a configurable public GitHub raw-file component catalog source.
- Add local inspection, foreground download approval, size/SHA-256 verification, cross-app installation locking and atomic version-directory installation.
- Create separate component instances and dispose cancelled late results; keep installed versions available offline.
- Add explicit update discovery without automatic installation or replacement.

### Examples and UI

- Add a foreground session and Falcon/Vue download/cancel/progress/retry prompt.
- Add a runnable Node reference host and Hello catalog component.
- Add a Falcon host factory, page integration example and production-bytecode compile check using an external local toolchain.

### Documentation and validation

- Document host adapters, exact-version installation, GitHub catalog maintenance, API and page lifecycle integration.
- Add behavioral tests for approval, cancellation, retries, integrity, concurrency, storage boundaries and runtime compatibility.
- Keep keyboard as a design placeholder. Falcon real-device adapters, package-external loading and hardware acceptance are not yet validated; npm packages remain unpublished.
