# Changelog

## 0.2.0 - 2026-09-30

### Breaking changes

- Require host-owned trust configuration in both the source and component manager; reject unsigned installs instead of falling back to 0.1 behavior.
- Replace plain raw-file source ref/catalogPath options with signed GitHub Release catalogs and a release selector.
- Preserve original signed manifest bytes and a reserved manifest.json.sig.json alongside installed files.

### Signature enforcement

- Verify Ed25519 envelopes with pinned SPKI public keys, strict Base64/UTF-8 decoding, purpose separation and host crypto adapters.
- Bind repository identity, source commit, catalog records, component versions and manifest SHA-256 before payload downloads.
- Independently verify custom-source metadata in the manager; recheck installed signatures and file hashes before runtime imports and during offline use.
- Add signature refusal messages, cancellation checks, tamper tests, signed Release host smoke tests and updated Node/Falcon examples.
- Keep valid older signed versions usable; no anti-rollback, expiration, highest-version tracking or device binding.

### Distribution and integration

- Publish component-catalog.sig.json as a small standalone Release asset so devices can install a single component without downloading the whole repository.
- Document host crypto contracts, public-key ownership, migration from unsigned installs and remaining Falcon native/hardware validation.
- Runtime packages advance to 0.2.0; Hello remains 0.1.0 and keyboard remains unimplemented.

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
