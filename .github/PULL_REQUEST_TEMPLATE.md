## Summary

<!-- What does this PR do? 1-3 bullet points. -->

## PR Title Convention

> **Important:** PR titles must use [Conventional Commits](https://www.conventionalcommits.org/) format.
> Release Please parses the **squash-merge commit message** (which defaults to the PR title) to determine version bumps and changelog entries. A PR merged without a conventional prefix will not trigger a release.

| Prefix | Version bump | Example |
|--------|-------------|---------|
| `fix:` | Patch (0.0.x) | `fix: correct sales-invoices list period validation` |
| `feat:` | Minor (0.x.0) | `feat: add reconcile preview --ledger flag` |
| `feat!:` or `BREAKING CHANGE:` | Major (x.0.0) | `feat!: rename a command group or flag` |
| `chore:` | No release | `chore: update dev dependencies` |
| `docs:` | No release | `docs: clarify credential resolution order` |
| `style:` | No release | `style: fix lint warnings` |
| `refactor:` | No release | `refactor: extract shared query builder` |
| `test:` | No release | `test: add reconcile period edge cases` |
| `ci:` | No release | `ci: pin actions to commit SHAs` |
| `build:` | No release | `build: drop unused esbuild dependency` |

Optional scope: `fix(reconcile): ...`, `feat(palk): ...`

## Testing

- [ ] `pnpm install` succeeds
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds
- [ ] `node dist/cli.js --version` and `--help` both work
- [ ] If touching the API client or signing: `__tests__/client/signer.test.ts` stays green
- [ ] If touching `reconcile`: tested with `reconcile preview` (read-only) against a real account where possible

## Related Issues

<!-- Link related issues: Fixes #NN, Refs #NN -->
