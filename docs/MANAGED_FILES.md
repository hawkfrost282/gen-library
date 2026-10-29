# Your files in Gen Library

Normal imports make a managed copy inside the Library you chose. Import files, Import folder, dragging in outside files and pasting images all use this managed storage. Your source originals remain where they were. Linked-folder import is a separate explicit choice.

The Library is an ordinary directory, not a sealed photo-library package:

```text
Your Library/
  Assets/
    image.png
    Momo/
      another-image.png
  .serpent/
    library.db
    …catalog settings, thumbnails and other supporting data…
```

`Assets/` holds the actual files in their original formats. Physical folders in the app correspond to directories here. Smart Folders and Collections only reference those files; appearing in several views does not create more copies. The hidden `.serpent/` directory holds the catalog and supporting data separately.

## Open the files directly

- **Library files in Finder**, above the image grid, opens this Library's actual `Assets/` directory even when the view is empty or filtered.
- Select one image and choose **Reveal in Finder** in its details panel to highlight that exact file on disk. For an explicitly linked image, this reveals its original location.
- Physical-folder context menus also provide **Open in Finder**.

Windows uses File Explorer labels. These controls use the existing Library and asset identities to resolve the real path; they do not export temporary copies. You can browse, open and copy the files independently in Finder, including when Gen Library is closed.

Vault files remain inside encrypted storage, and the private workspace's existing external-access restrictions are unchanged by these shortcuts. Returning Vault files to the normal Library still uses the password-authenticated verified migration.
