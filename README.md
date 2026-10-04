# claude-mods

This repo holds the Claude Code mods that yahyabedirhan made. A mod changes how Claude Code operates or how it looks. A mod can add a pane, a band above the prompt, a status line or a hook. Each mod is a Claude Code plugin with a TypeScript hooks module. Only Claude Code loads mods. Other agent harnesses do not load them.

> **WARNING**
> Mods do not run in a sandbox. A mod has the same access as Claude Code. Read the code of a mod before you install it.

## Install

1. Add this repo to Claude Code. Do this step one time only:

   ```bash
   claude plugin marketplace add yahyabedirhan/claude-mods
   ```

   - Result: Claude Code shows `Successfully added marketplace: claude-mods`.

2. Install a mod. Use the name of the mod from the [Mods](#mods) table:

   ```bash
   claude plugin install <mod-name>@claude-mods
   ```

   - Result: Claude Code shows `Successfully installed plugin: <mod-name>@claude-mods`.

3. Start a new Claude Code session.

   - Result: The session loads the mod.

> **NOTE**
> The command in step 1 also accepts the path of a local clone of this repo. Use a local clone when you change a mod.

## Mods

| Mod | What it does | Install command |
|---|---|---|
| [session-status](plugins/session-status/README.md) | Shows a read-only pane with the status of a long session: the current work, the decisions that you must make, the progress and the surprises. | `claude plugin install session-status@claude-mods` |

## How the mods work

### session-status

In a long session, the status of the work is hidden in the chat. The `session-status` mod shows the status in a pane next to the chat. The agent records decisions and surprises with a status tool. The mod counts the other values from session events.

```text
opens        on the first subagent, task list, effort or recorded item; /session-status opens or closes it
pane         doing now · blocked on you · review later · progress · links · surprises · counters · last update
band         on a narrow terminal, one line above the prompt: 2 blocked · 1 review · 3/9 done · 1 surprise
you answer   in the chat; the agent marks the decision resolved, and the pane moves it to the history
end of work  the agent writes one numbered list of open review-later decisions; the pane highlights them
pings        one shipyard ping for each blocked decision; the mod removes the ping after you answer (optional)
observer     a Haiku check every 5 turns for loops, time sinks and steps outside the flow; shown as [observer] surprises
keeps        the status after resume, /clear (open decisions only) and /compact
```

## Add a mod

1. Put the mod in `plugins/<name>/`. Include `.claude-plugin/plugin.json`, `hooks/hooks.json`, the hooks module and the `*.test.ts` tests.
2. Add the mod to `.claude-plugin/marketplace.json`.
   - Result: Claude Code can find the mod in this repo.
3. Add a row for the mod to the [Mods](#mods) table.
4. Add a section for the mod to [How the mods work](#how-the-mods-work). Use the same shape as the other sections: two sentences and one outline.
5. Load the mod one time:

   ```bash
   claude --plugin-dir plugins/<name>
   ```

   - Result: Claude Code writes the generated types to `plugins/<name>/.claude-plugin/types/`.

6. Do a check of the repo's mod list:

   ```bash
   claude plugin validate .
   ```

   - Result: The command shows `Validation passed`.

7. Do a check of the manifest and the hooks module of the mod:

   ```bash
   claude plugin validate plugins/<name>
   ```

   - Result: The command shows `Validation passed`.

8. Run the tests of the mod:

   ```bash
   claude plugin test plugins/<name>
   ```

   - Result: The command shows `0 fail`.

9. Do a type check of the mod:

   ```bash
   tsc -p plugins/<name>
   ```

   - Result: The command shows no errors.

> **NOTE**
> The `tsconfig.json` of a mod extends `.claude-plugin/types/tsconfig.json`. Claude Code writes this file when it loads the mod. Do step 5 before step 9.

> **CAUTION**
> Do not commit the generated `types` folder.
