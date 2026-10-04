# claude-mods

A Claude Code plugin marketplace of mods. Each mod is a plugin: a TypeScript
hooks module that changes how Claude Code behaves or looks. Mods run only in
Claude Code; other harnesses don't load them.

Mods are not sandboxed: they run with Claude Code's own access. Read a mod
before you install it.

## Install

Add the marketplace, then install a plugin from it:

```sh
claude plugin marketplace add yahyabedirhan/claude-mods
claude plugin install session-status@claude-mods
```

`claude plugin marketplace add` also takes a local path to a clone of this
repository.

## Plugins

| Plugin | What it does |
| --- | --- |
| [`session-status`](plugins/session-status/README.md) | A read-only pane that shows the session's live status: doing now, decisions, progress, surprises and the last update. |

## Develop

Each mod lives in `plugins/<name>/` with `.claude-plugin/plugin.json`,
`hooks/hooks.json`, its hooks module and its `*.test.ts` tests.

```sh
claude plugin validate .                    # the marketplace manifest
claude plugin validate plugins/<name>       # the mod's manifest and hooks module
claude plugin test plugins/<name>           # the mod's tests
tsc -p plugins/<name>                       # type-check the mod
```

The type-check needs the mod's generated types. A mod's `tsconfig.json`
extends `.claude-plugin/types/tsconfig.json`, which Claude Code writes when
it loads the plugin. Load the plugin once (for example with
`claude --plugin-dir plugins/<name>`) before you run `tsc`. Don't commit the
generated `types` folder.
