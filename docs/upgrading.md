# Upgrading from the earlier name

The project was first published as `ecc-harness` (0.1.x - 0.2.x) and is now **haku** (0.3.0). Nothing is migrated automatically; do these once per machine and repository.

## Machine

1. Remove the old plugin and marketplace, then add the new ones:

   ```
   claude plugin uninstall ecc-harness@ecc-harness
   claude plugin marketplace remove ecc-harness
   claude plugin marketplace add https://github.com/<owner>/haku.git
   claude plugin install haku@haku
   ```

2. Skills are now `/haku:setup`, `/haku:plan`, `/haku:build`.
3. Worker worktrees moved from `~/.eh/w` to `~/.haku/w` (`HAKU_HOME` replaces `ECC_HARNESS_HOME`). Finish or abandon workers started under the old name first: they are no longer listed, and their worktrees stay in `~/.eh/w` until you delete them.

## Repository

1. Rename the config folder `.ecc-harness/` to `.haku/` (it holds `config.json` and `verify.json`) and commit it to the default branch through a pull request.
2. Rename the base issue label so existing issues follow: `gh label edit ecc-harness --name haku`.
3. Worker-summary and verification comments written under the old name (`<!-- ecc-harness:... -->`) are not recognised. They only matter for issues that are still open; closed issues are unaffected.
4. In a project's own settings, point `extraKnownMarketplaces` and `enabledPlugins` at the new marketplace and plugin names.
