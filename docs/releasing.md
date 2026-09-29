# Prepare and publish a release

All public `@jitterbox/repro-*` packages share **0.2.1**. Wire schemas retain their own versions; adding defaulted presentation preferences preserves old inputs. Runtime package constants and capture stage identities track the package release. Legacy runs remain explicitly renderable; missing observations are never invented during migration.

## Prepare without publishing

```sh
pnpm install --frozen-lockfile
pnpm release:prepare
pnpm typecheck
pnpm lint
pnpm release:check .repro/release-0.2.1
pnpm test:clean-install
```

`release:prepare` builds, checks generated references and copies standalone README/LICENSE assets into packages, plus docs and skills into the CLI. `release:check` packs actual tarballs and verifies version/license/access, executable files, no unresolved `workspace:` dependencies, CLI docs/skills, and absence of runtime evidence/secrets. The output includes SHA-256 checksums and a relocatable consumer manifest. Build-time resources are ignored by Git and regenerated; they are included in npm tarballs. Use `pnpm pack` only after preparation.

Run the Windows/Linux compatibility job and relevant browser/privacy suites before a public release. Scene visual acceptance remains a separate gate; 0.2 packaging does not promote Hyperframes to the default. Do not represent pending CI or unreviewed artifacts as accepted.

## npm prerequisites

- Confirm ownership/publish permission for the **@jitterbox** npm scope. Source package names alone do not reserve that scope. If unavailable, rename all packages/imports and documentation consistently before publishing.
- For GitHub publication with provenance, use a public GitHub repository; confirm the release commit includes only intended project work and no restricted recordings.
- Configure the GitHub `npm-release` environment and an npm granular publishing token in `NPM_TOKEN`, with the scope/package permissions and 2FA publishing policy your organization requires. The workflow uses this token only in the publish step. Trusted publishing can replace the token once configured for each package.
- Create a `v0.2.1` tag pointing at the reviewed, tested commit. Publishing npm packages is irreversible per version; bump for subsequent corrections.

See [npm's provenance requirements](https://docs.npmjs.com/generating-provenance-statements/) for public repository/package and workflow identity constraints.

## Publish

Dispatch **Release packages** from the version tag. Leave `publish` false to produce only the checked release artifact. Set it true only for an intended publication; the workflow enforces a matching tag, validates every archive hash before the first publication, and publishes dependency packages before dependents with `--access public --provenance`.

For a locally authenticated npm account, publish the checked archives from the clean, tagged checkout:

```sh
npm whoami
node scripts/publish-release.mjs .repro/release-0.2.1 --local
```

Local publication uses npm's interactive authentication and does not attach GitHub provenance. It works with a private source repository; repository visibility is unchanged. Both paths require HEAD to match the version tag and verify every archive before publishing.

Nothing in `pnpm build`, npm install, setup or the skill installer publishes packages. If publication stops partway, inspect the registry and failure before resuming; already-published versions are immutable and the script deliberately fails on a duplicate.

## Documentation maintenance

`pnpm docs:generate` connects to the built MCP server and traverses Commander to generate all command options, tool schemas and resources. `pnpm docs:check` fails on drift. Update the narrative guides when semantics change, not just the generated interface listings. Skills should use installed-version `--help`, `capabilities`, `treatments`, `defaults` and schema resources.
