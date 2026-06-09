# Contributing

Thanks for your interest in improving `elnora-merit-aktiva`.

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

- Keep changes focused. Conventional commit titles (`feat:`, `fix:`, `docs:`…).
- CI must pass: lint, typecheck, build, and test on Linux; build + CLI smoke on macOS and Windows.
- Never commit credentials or a populated `.env`.
