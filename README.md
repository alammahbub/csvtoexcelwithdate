# csv2xlsx - Chrome/Edge Extension

csv2xlsx is a lightweight, high-performance extension for Google Chrome and Microsoft Edge that automatically intercepts CSV downloads, prepends the download date/time, and converts them to Microsoft Excel (.xlsx) workbooks natively.

## Features
- **Real-time Conversion**: Automatically intercepts CSV downloads and converts them to XLSX in real-time.
- **Large File Support**: Uses memory-efficient streaming OpenXML generators and IndexedDB chunked data transfer to handle massive CSV files (exceeding 64MB) without crashing or freezing.
- **Session Preservation**: Injects a custom reader in the active tab context to read blob and secure HTTP/HTTPS files under the user's active login/cookie session.
- **Date Prepending**: Prepends a clean timestamp (e.g. `YYYY-MM-DD_HH.MM.SS-Filename.xlsx`) to the download filename.
- **Vibrant Light-theme Dashboard**: Click on the toolbar icon to view the active converters and access quick links.

## Project Structure

Below is the layout of the project, separating the tracked extension files from untracked/private packaging assets:

```text
.
├── csvtoexcelwithdate/       # Extension source code (tracked by Git)
│   ├── bg.js                 # Background service worker (intercepts downloads & coordinates offscreen task)
│   ├── icon.png              # Extension icon (default)
│   ├── icon128.png           # Extension icon (128x128)
│   ├── icon16.png            # Extension icon (16x16)
│   ├── icon48.png            # Extension icon (48x48)
│   ├── manifest.json         # Chrome Extension manifest (MV3 configuration)
│   ├── offscreen.html        # Offscreen document host (needed for DOM/Web Worker API access)
│   ├── offscreen.js          # Offscreen script (handles chunked CSV parsing and Excel generation via SheetJS)
│   ├── popup.html            # Extension popup UI dashboard
│   ├── popup.js              # Controls interactions and active conversion views in popup
│   └── xlsx.full.min.js      # SheetJS (xlsx) minified standalone library
├── csvtoexcelwithdate.crx    # Pre-packaged CRX file for direct installation (untracked)
├── csvtoexcelwithdate.pem    # Private key for extension packaging (untracked - KEEP PRIVATE)
└── README.md                 # Extension documentation (this file)
```

## Installation from CRX File
1. Open Microsoft Edge or Google Chrome.
2. Go to the Extensions settings page (`edge://extensions` or `chrome://extensions`).
3. Turn on **Developer mode** (bottom-left or top-right toggle).
4. Drag and drop the `csvtoexcelwithdate.crx` (or `csv2xlsx.crx`) file directly onto the Extensions page to install.

## Installation from Directory (Unpacked)
1. Open the Extensions settings page.
2. Turn on **Developer mode**.
3. Click **Load unpacked** (top-left button).
4. Select the `csvtoexcelwithdate` folder.
