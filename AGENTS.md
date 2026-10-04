# Agent instructions

A plugin marketplace of Claude Code mods. Each mod is a plugin: a
TypeScript hooks module that changes how Claude Code behaves or looks.
Mods run only in Claude Code; other harnesses don't load them.

- Each mod lives in its own plugin folder with `.claude-plugin/plugin.json`,
  `hooks/hooks.json` and its hooks module.
- Check a mod with `claude plugin validate <folder>`, then
  `claude plugin test <folder>` for its `*.test.ts` files.
- Mods are not sandboxed: they run with Claude Code's access. Keep secrets
  and personal details out of mod code and tests.
- The repo is private for now and may become public later, so write
  everything as if it were public.

## Agent skills

### Issue tracker

GitHub issues in `yahyabedirhan/claude-mods`, via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels, each named after its role. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.
