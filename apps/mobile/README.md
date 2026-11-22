# School ERP Mobile

Expo / React Native application in the School ERP pnpm workspace.

## Development

Run commands from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm dev:mobile
```

Then use the Expo CLI to open Android, iOS or web. SDK-compatible native packages
are managed with `pnpm --filter @school-erp/mobile exec expo install`.

## Foundation structure

- `src/app/` — Expo Router routes and layouts.
- `src/components/` — reusable mobile UI components.
- `src/theme/` — shared design tokens.
- `tests/` — Node.js foundation/configuration regression tests.

## Checks

```bash
pnpm --filter @school-erp/mobile test
pnpm --filter @school-erp/mobile exec expo-doctor
pnpm --filter @school-erp/mobile exec expo config --type public
```

Authentication, role-aware workspaces and ERP feature screens are intentionally
not implemented in M1. They will be introduced in their respective batches
against the existing API and authorization model.
