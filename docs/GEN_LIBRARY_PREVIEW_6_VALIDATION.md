# Gen Library personal.6 — managed files and Finder access

October 28, 2026. Locally ad-hoc signed macOS arm64 preview; not Developer ID signed or notarized.

Standard imports already copy files into the Library's ordinary `Assets/` tree. This update makes that storage model clearer and exposes existing shell actions directly:

- **Library files in Finder** above the image grid opens the actual Assets directory using the Library-root identity.
- **Reveal in Finder** in single-image details resolves and highlights that asset's current canonical location. It is unavailable for missing/trashed images and is hidden during multi-selection.
- Import and Organization copy explains managed storage, retained source originals and explicitly chosen linked folders.
- Existing private-workspace external-access restrictions are unchanged. The shortcuts are available in normal Libraries.

## Checks

- Existing import-command, shell-result and localization checks: 14 passed.
- Real worker managed-import and folder-path checks: 8 passed, with temporary files confined to the ignored project-local test directory.
- Private-workspace policy checks: 5 passed.
- Type checking passed. Targeted lint: zero errors, two existing App.tsx hook warnings.
- Production packaging, runtime verification and local signature verification passed.
- After the Mac was unlocked, both Finder buttons were checked in the packaged app. Library files in Finder opened the actual Assets directory; Reveal in Finder selected the actual managed image in its physical subfolder. The controls fit the app layout without crowding the title bar. No user image collection was imported, moved or altered.

See [how to access the files](MANAGED_FILES.md) and [the organization architecture](ORGANIZATION_MODEL_REVIEW.md).
