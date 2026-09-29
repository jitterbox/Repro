# Install Repro

Repro 0.2.0 is a local Node.js tool. Its CLI, Playwright fixture and optional MCP server run on **Windows x64 and Linux x64**. Use Node.js 22+; the pinned validation environment is Node 22.22.3. The scene renderer uses the same bundled fonts on both systems. Browser and native dependencies are installed explicitly, never by a hidden npm postinstall script.

## Install the skills first

From an evidence folder or an existing project:

```sh
npx skills@latest add jitterbox/Repro --copy
```

Choose `repro-setup`, `repro-capture`, `repro-annotate`, `repro-compare`, and/or `repro-file`, then select your harness. Ask your agent to “Use repro-setup to install Repro here.” Skills install instructions; the setup workflow installs the runtime separately.

For a non-interactive project installation targeting Claude Code, Cursor and Codex:

```sh
npx skills@latest add jitterbox/Repro --skill repro-setup repro-capture repro-annotate repro-compare repro-file --agent claude-code cursor codex --copy --yes
```

Add `--global` for user-wide skills. `--copy` avoids requiring Windows symlink privileges. Other supported harnesses can be selected interactively. A local checkout or unpacked CLI package works too: `npx skills@latest add ./skills --copy`. See the [installer's official reference](https://github.com/vercel-labs/skills#readme) for discovery, update and removal. This uses the same open installer approach as [Matt Pocock's skills](https://github.com/mattpocock/skills#readme).

**Release status:** the 0.2.0 package/release machinery is prepared in this repository. Publication is a separate maintainer action. Until the package exists in npm and these files are pushed to GitHub, use the source or tarball route below; remote skill installation reads the pushed repository.

## npm installation after publication

These commands work in PowerShell and Linux shells:

```sh
mkdir repro-evidence
cd repro-evidence
npm init -y
npm install --save-dev @repro/cli@0.2.0 @repro/playwright@0.2.0 @repro/mcp@0.2.0
npx repro setup --system
npx repro doctor
npx repro init
```

`@repro/mcp` is optional. Keep the CLI and fixture at the same version. Use the project's `npx repro` in subsequent examples; `repro` alone works when installed globally or inside an npm/pnpm script. Project-local installation keeps scenario dependencies available to Playwright. A global CLI alone is insufficient to import `@repro/playwright` in a scenario.

## Install from source now

Install Git, Node 22+ and pnpm 9.15.0. Then:

```sh
git clone https://github.com/jitterbox/Repro.git
cd Repro
npm install --global pnpm@9.15.0
pnpm install --frozen-lockfile
pnpm build
node packages/cli/dist/bin.js setup --system
node packages/cli/dist/bin.js doctor
```

For skills from this checkout, run `npx skills@latest add ./skills --copy`. Invoke the CLI with `node packages/cli/dist/bin.js`, or create a relocatable toolchain for an unrelated evidence folder:

```sh
pnpm release:prepare
pnpm release:pack .repro/release-0.2.0
cd .repro/release-0.2.0
pnpm install
pnpm exec repro setup
pnpm exec repro init
```

The release directory contains local tarball dependencies and checksums. Move the whole directory together. External dependencies still need registry access or a populated package cache; it is not a fully offline browser/system installer. To install skills from this toolchain, use `npx skills@latest add ./node_modules/@repro/cli/skills --copy`.

## Native dependencies and supported hosts

`repro setup --system --dry-run` prints exactly what would execute. `repro setup` installs only the pinned Chromium browser and headless shell, then checks prerequisites. `--no-browser` skips the browser download; `--system` provisions native dependencies.

- **Windows 10/11 x64:** WinGet installs `Gyan.FFmpeg` and `UB-Mannheim.TesseractOCR`. Install Windows App Installer if WinGet is missing. Package installers may request elevation. Repro resolves WinGet executable links and the normal Tesseract installation directly; portable locations can be configured below. Use a current Windows release supported by Playwright.
- **Ubuntu 24.04 / Debian x64:** setup uses apt for FFmpeg (including libass), Tesseract English data, fontconfig and Liberation fonts, then Playwright's browser dependency installer. System setup needs root/sudo; browser-only setup works in an ordinary account once those packages exist.
- **Other Linux distributions:** install those native dependencies using your distribution's package manager, satisfy Playwright's Chromium libraries, then run `repro setup`. Automatic system provisioning intentionally reports unsupported distributions instead of guessing package names. Musl/Alpine, ARM, macOS and OS-desktop capture are outside the validated 0.2 baseline.

The compatibility workflow exercises packed consumer installation, process cancellation, capture, rendering, OCR and scene seeking on Ubuntu 24.04 and Windows Server 2022. A configured CI job is not evidence of a successful run: inspect the latest [CI result](https://github.com/jitterbox/Repro/actions) for a particular release. Real GUI interactions beyond browser content are not captured.

The evidence fixture has a separate 120-second setup/teardown budget for host inventory and capture finalization. Your Playwright test timeout still controls the reproduction steps. Font inventory streams up to four files at a time and reuses hashes only while file identity, size and modification metadata remain unchanged.

For explicit portable paths, set `REPRO_FFMPEG`, `REPRO_FFPROBE`, and `REPRO_TESSERACT` to absolute executable filenames. For example, in PowerShell:

```powershell
$env:REPRO_TESSERACT = 'C:\Program Files\Tesseract-OCR\tesseract.exe'
npx repro doctor
```

In Linux:

```sh
export REPRO_TESSERACT=/opt/tesseract/bin/tesseract
npx repro doctor
```

Use `TESSDATA_PREFIX` when English OCR data is in a custom location. `PLAYWRIGHT_BROWSERS_PATH` must have the same value during setup and execution. FFmpeg, OCR and browser assets retain their upstream licenses; Repro does not redistribute system binaries. Native npm dependencies may need a compiler if your Node/OS combination has no prebuilt binary; the pinned x64 CI environment is the supported starting point.

## MCP

Install `@repro/mcp` beside the CLI. Register its **stdio** executable in the harness's MCP configuration. A shell-independent configuration that works on both operating systems is:

```json
{
  "mcpServers": {
    "repro": {
      "command": "node",
      "args": ["/absolute/path/to/evidence/node_modules/@repro/mcp/dist/bin.js"]
    }
  }
}
```

Use a Windows absolute path such as `C:/work/evidence/node_modules/@repro/mcp/dist/bin.js` on Windows. The outer configuration format varies by harness; retain the same command and args. Avoid relying on `npx.cmd` execution through a shell. Tools and resources are enumerated in the [generated MCP reference](reference/mcp.md). The MCP setup tool defaults to dry-run, while the CLI setup command performs the requested installation.

No AI API key is needed by Repro for capture, render, review or replay. The external harness supplies its model access. ALM upload credentials are independent and needed only for delivery; never place them in scenarios or prompts.
