/** Personal build identity. File formats and protocol names stay compatible with upstream. */
export const APP_NAME = 'Gen Library';
export const APP_ID = 'com.hawkfrost.genlibrary';
// An upstream installer would replace our changes. Updates need a reviewed custom build.
export const ENABLE_UPSTREAM_UPDATES = false;
// The original connector has no pairing flow. Keep it closed until a paired companion exists.
export const ENABLE_BROWSER_CONNECTOR = false;

// macOS development preview; see docs/ENCRYPTED_LIBRARIES.md for behavior and limits.
export const ENABLE_ENCRYPTED_LIBRARIES = true;
