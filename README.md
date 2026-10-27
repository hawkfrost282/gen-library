# Gen Library

Gen Library is a personal image-library fork of [Serpent](https://github.com/dolag233/Serpent), based on version 0.3.3 (`dbf4c27`). It keeps Serpent's readable `Assets` folders, tagging, ratings, collections, and Finder access, with changes focused on generated-image metadata and safer file handling.

This is an early macOS development preview, not a finished release. The name and current bookshelf icon are provisional. Original MIT copyright and third-party notices are preserved.

## What this preview adds

- **Generation details** in the image inspector: embedded prompt, negative prompt, generation models, LoRA names, seed, sampler, steps, guidance and dimensions when available. Supports common ComfyUI API graphs, AUTOMATIC1111-compatible parameters, and Draw Things / compatible JSON comments in supported image formats. Copy full prompts or inspect the raw generation data. Extraction runs locally, without an AI API call.
- **Safer linked-file deletion:** linked originals go to the operating system's Trash. Filenames are treated as literal paths. A failed Trash operation never falls back to permanent removal. Reimport recovered files to restore their library records. Separate managed-file permanent-delete actions still require their existing confirmations.
- **Verified optional local-model downloads:** only pinned official URLs are used; downloaded files must match the recorded size and SHA-256 before installation. Unverified mirrors are removed.
- **Static HTML previews:** document scripts, forms, frames and remote resources are blocked. Automatic HTML thumbnails also disable JavaScript.
- **Closed browser connector:** the original unpaired browser-extension listener is disabled. A pairing flow is needed before enabling it again.
- Updated production dependencies and bounded JSON validation before MCP protocol handling. The production dependency audit returned zero known vulnerabilities on October 27, 2026. Development-tool advisories still need separate review; this is not a complete security certification.
- A separate Gen Library application identity and preferences. Upstream automatic updates are disabled so an official Serpent update cannot overwrite the fork.

Imported files are still copied into normal library directories. Linked folders remain available. Generation fields depend on what the original image embeds; missing or ambiguous information is shown as such. Arbitrary custom ComfyUI nodes and every generator's metadata format are not supported yet. No generation metadata is rewritten into original images.

## Next development stages

See [the roadmap](docs/GEN_LIBRARY_ROADMAP.md). Encrypted libraries are **not implemented or enabled in this preview**. Ordinary libraries, tags, thumbnails and the catalog are not encrypted. AI connection improvements and intentional social publishing are separate work.

## Build on macOS

Use Node.js 24 and the Xcode command-line tools.

```sh
npm ci
npm run rebuild:native
npm run typecheck
npm run test:unit
npm run package
npm run verify:package
```

The app is produced at `out/Gen Library-darwin-arm64/Gen Library.app` on Apple Silicon. The native rebuild supports project folders containing spaces and keeps its header cache in `.cache/`. Media archives, their manifests, and bundled binaries are checksum-checked. Packaging generates the public automation API declaration from the command registry.

The preview is ad-hoc signed locally, not Apple Developer ID signed or notarized. Other operating systems have not been validated for this fork. This repository contains code and synthetic test fixtures, not an image collection, credentials, or private library databases.

## Upstream documentation and license

[Original English documentation](README.en.md) · [Original Chinese README](README.upstream.zh-CN.md) · [MIT license](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

Upstream documentation describes Serpent; the differences above take precedence for Gen Library. Internal protocol names and compatible file formats retain their upstream names.
