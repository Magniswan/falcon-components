# Repository guidelines

- This is an independent Falcon/Vue component library. Keep CloudBrowser business logic, credentials and production configuration outside this repository.
- Read README.md and docs/roadmap.md before work. Planned APIs are proposals, not implemented capabilities.
- Use Node 18 (prefer 18.20.8) for build tooling; receive the exact executable path from the environment or user. Do not commit a Node binary or a proprietary SDK.
- Put reusable components in packages/<name>, examples in examples/, and design/compatibility evidence in docs/.
- Use ESM JavaScript, two-space indentation and semicolons. Falcon UI uses its supported Vue 2/CSS subset, not browser DOM APIs.
- Receive logical dimensions and platform services from the host. Do not hard-code a device model, display size, application ID or global viewport in a component.
- Keep component versions independent. Keep packages private until an implementation and publication scope are ready.
- Run node scripts/check-repository.mjs and git diff --check before committing. Add behavioral tests when implementing editor state, async queries or loading behavior.
- Clean up timers, subscriptions and stale async work on close/unload. Isolate state across input sessions and applications.
- Separate source, build and real-device evidence. A directory readable by root does not establish that Falcon's runtime loader accepts it.
- Do not claim keyboard, package-external loading or hardware-overlay support without evidence. Do not copy private runtime internals or bypass the host module loader without a scoped design.
- Never restart a dictionary pen routinely. If ADB requests adb shell auth, leave authentication to the user.
- Do not commit SDKs, compiled bytecode, native binaries, AMRs, runtime data, secrets or private device identifiers. Record third-party code and data licensing before inclusion.
- Save intended changes in focused Git commits. Remote publication requires the user's requested platform/account and scope.
