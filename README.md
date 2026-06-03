# Obsidian Plugins

Plugins I built for my own Obsidian vault. Vibe coded with AI assistance.
All of them solve something that was missing or broke after an update.

## Plugins

| Plugin                                                         | Description                                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [click-to-edit-image](./click-to-edit-image)                   | Brings the embed syntax into focus when you click an image. No more hunting for it in source        |
| [copy-image-context-menu](./copy-image-context-menu)           | One right-click to copy any embedded image straight to the clipboard                               |
| [delete-image-context-menu](./delete-image-context-menu)       | Deletes an image and scrubs every embed reference from the vault in a single right-click            |
| [highlight-open-tabs](./highlight-open-tabs)                   | Marks files already open in the File Explorer so you stop navigating to the same note twice         |
| [image-auto-refresh](./image-auto-refresh)                     | Detects when an embedded image is edited externally and reloads it on the spot. No tab close needed |
| [inline-copy](./inline-copy)                                   | One click on any inline code copies it. No selecting, no Ctrl+C                                    |
| [jump-random](./jump-random)                                   | Teleports to a random section of the current file. Useful for review or rediscovery                 |
| [line-counters](./line-counters)                               | Shows the total line count of the open file in the status bar                                       |
| [max-font-zoom](./max-font-zoom)                               | One Ctrl + scroll up jumps the font straight to maximum. No incremental scrolling                   |
| [middle-click-scroll](./middle-click-scroll)                   | Middle-click to lock into auto-scroll, like VS Code's scrollOnMiddleClick                           |
| [min-font-zoom](./min-font-zoom)                               | One Ctrl + scroll down jumps the font straight to minimum                                           |
| [sorted-import](./sorted-import)                               | Imports images and videos as embeds in your chosen sort order. Handles filename collisions the same way Obsidian does natively                         |
| [sticky-edit-button](./sticky-edit-button)                     | Tracks the edit-block-button as you scroll through tall images. It stays in the corner instead of disappearing off screen |
| [tab-path-tooltip](./tab-path-tooltip)                         | Hover a tab to see its full vault-relative path. Useful when filenames alone aren't enough          |
| [underline](./underline)                                       | Adds ++underline++ syntax to Live Preview and Reading Mode. The missing markup                      |
| [show-external-urls](./show-external-urls) | Expands every external link to show its full URL inline, across all editor modes |

## Installation

Each plugin folder contains `main.js` and `manifest.json`.
Copy the folder to `.obsidian/plugins/` and enable it in Settings → Community Plugins.