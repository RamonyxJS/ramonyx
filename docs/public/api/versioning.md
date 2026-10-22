# API Versioning & Stability

Ramonyx follows semantic versioning (`MAJOR.MINOR.PATCH`) for every published package:
`ramonyx`, `@ramonyx/*`, and `create-ramonyx-app`.

## Public surface

The public API is the set of value/type exports declared by each package's `exports` map and
root `src/index.ts`. Subpaths are part of the surface too (`@ramonyx/react/client`,
`@ramonyx/react/islands`, `@ramonyx/security/ssrf`, and so on).

Internal modules, generated `dist/` files, and `docs/internal/` are not public APIs.

## Compatibility policy

- **PATCH**: bug fixes and documentation/typing corrections with no intentional behavior break.
- **MINOR**: additive features, new exports, and opt-in behavior. Existing exports keep working.
- **MAJOR**: breaking changes, including removal/rename of exports or changed defaults.

At least one minor release must warn about a planned removal before the major release removes it.
Deprecated APIs are documented in the changelog and, where practical, emit a runtime warning.
Migration notes and an upgrade path are required for every major release.

## Contract enforcement

`tests/package-exports.test.ts` locks the contract values for the public packages. The generated
`docs/public/machine/api.json` records exports and types for each package. Additive changes must
update both; removing or renaming a public export is a deliberate major-release decision.

## Runtime Rust

The Rust/V8 runtime is a separate experimental track. Its packages/binaries are not part of the
Node framework's 1.0 compatibility promise until its own exit criteria promote it explicitly.
