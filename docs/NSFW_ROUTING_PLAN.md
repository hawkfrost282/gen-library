# Optional Vault routing — personal.5

The former NSFW-only routing preview is now a configurable physical-storage policy. Vault storage is optional and can hold any supported asset; NSFW remains descriptive metadata.

- Triggers: NSFW, Vault, NSFW OR Vault, or manual only.
- Character-based physical placement is independent and off by default.
- Automatic rule matches can queue moves; manual file selection also works without a trigger tag.
- A locked destination leaves the original pending outside encryption.
- Enabling a trigger requires an explicit existing-matches versus future-changes choice.
- Disable Vault requires its password and a verified merge into the current normal Library before storage is marked disabled.
- Smart Folder membership is virtual and never moves or duplicates a canonical file.

See [using encrypted libraries](ENCRYPTED_LIBRARIES.md) for the controls and [the organization model review](ORGANIZATION_MODEL_REVIEW.md) for the architecture, transfer guarantees and current limits. The historical [personal.4 validation report](GEN_LIBRARY_PREVIEW_4_VALIDATION.md) describes the earlier implementation, not the current behavior.
