# Contributing

## Branch and review flow

- Create focused feature branches from `main`.
- Keep automation and runtime changes small and testable.
- Open pull requests against `main`.

## Local validation

```bash
node tests/smoke.mjs
node tests/automation.mjs
```

## Optional pre-commit setup

```bash
git config core.hooksPath .githooks
```

You can also use `.pre-commit-config.yaml` with the `pre-commit` tool if it is installed locally.
