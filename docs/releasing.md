# Releasing the SDK

This repository deliberately cannot publish yet: `package.json` is private
until the package owner chooses the final npm scope/name, repository URL, and
license. The CI workflow verifies artifacts only; it never has publish
credentials and never publishes a package.

## Prepare the first prerelease

1. Confirm ownership of the final npm scope and package name.
2. Add the chosen `repository` and SPDX `license` metadata, plus the matching
   `LICENSE` file.
3. Remove `private: true` and, for a scoped public package, set
   `publishConfig.access` to `public`.
4. Choose a prerelease version such as `0.1.0-rc.1` rather than changing the
   public API and first stable version at the same time.

## Verify before publishing

Run the same local checks as CI:

```sh
bun install --frozen-lockfile
bun run check
bun test
bun run check:package
npm pack --dry-run
```

The package check builds the SDK, type-checks an emitted-package consumer, and
imports every public subpath. CI additionally inspects the resulting tarball.

Run the local webhook fixtures too:

```sh
npm run fixtures:webhooks
```

Before calling a release stable, run one opt-in sandbox invoice against a
dedicated sandbox key and, when possible, a public HTTPS callback endpoint:

```sh
OXAPAY_SANDBOX_MERCHANT_API_KEY=your-sandbox-key \
OXAPAY_SANDBOX_CALLBACK_URL=https://your-public-endpoint.example/webhooks/oxapay \
OXAPAY_RUN_SANDBOX_SMOKE=1 \
npm run sandbox:smoke
```

See [sandbox verification](./sandbox.md) for its deliberate no-network default
and safety constraints.

## Publish intentionally

After the metadata and all checks are approved by the package owner, publish
the selected prerelease with npm's normal release process. Do not put sandbox
or production credentials in GitHub Actions merely to automate this first
release; the smoke test is intentionally opt-in and is better run from a
controlled environment.
