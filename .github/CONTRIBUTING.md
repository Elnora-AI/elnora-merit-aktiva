# Contributing

Thanks for your interest in improving `elnora-merit-aktiva`.

## Bug reports and feature requests

Open an issue using the appropriate template (bug report or feature request).
Please search existing issues first so we can avoid duplicates.

## Development

```bash
pnpm install
pnpm dev -- --help        # run the CLI from source
pnpm typecheck            # tsc --noEmit
pnpm lint                 # biome
pnpm test                 # vitest
pnpm build                # compile to dist/
```

## Conventions

- TypeScript, strict mode. Formatting is enforced by Biome (tabs, double quotes,
  semicolons, 120-col). Run `pnpm lint:fix` before committing.
- One command module per Merit resource group in `src/commands/`. Each exports
  `setup<Group>Command(program)`.
- The signing logic in `src/client/signer.ts` is verified against Merit's
  published test vector — any change there must keep `__tests__/client/signer.test.ts` green.
- Add or update endpoints from the official reference manual:
  https://api.merit.ee/connecting-robots/reference-manual/

## Pull requests

- Keep changes focused. PR titles must use [Conventional Commits](https://www.conventionalcommits.org/) —
  Release Please parses the squash-merge commit message (which defaults to the PR title)
  to determine version bumps and changelog entries.
- CI must pass: lint, typecheck, build, and test on Linux; build + CLI smoke on macOS and Windows.
- Never commit credentials or a populated `.env`.

## Conventional commit types

| Prefix | Version bump | When to use |
|--------|--------------|-------------|
| `fix:` | Patch | Bug fixes |
| `feat:` | Minor | New features |
| `feat!:` or `BREAKING CHANGE:` | Major | Breaking changes |
| `chore:`, `docs:`, `style:`, `refactor:`, `test:`, `ci:`, `build:`, `perf:`, `revert:` | None | Maintenance, no release |

## Security issues

**Do not open a public issue for security vulnerabilities.** Use one of the private
channels listed in [SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
By participating you agree to uphold it.
