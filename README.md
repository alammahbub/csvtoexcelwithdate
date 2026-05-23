# 📊 csv2xlsx - Smart Chrome/Edge Extension

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge-lightgrey.svg)](#)
[![Manifest Version](https://img.shields.io/badge/Manifest-V3-orange.svg)](#)

A lightweight, high-performance web extension for Google Chrome and Microsoft Edge that automatically intercepts CSV downloads, prepends the download date/time stamp, and converts them to Microsoft Excel (`.xlsx`) workbooks natively in real-time.

---

## 🚀 Key Features

*   **Real-time Native Conversion**: Automatically detects and intercepts standard CSV downloads, converting them on-the-fly to fully formatted `.xlsx` files without external server APIs.
*   **Large File Streaming Engine**: Employs memory-efficient streaming CSV parsers and chunked data handling inside an **Offscreen Document** context to process files larger than 64MB smoothly without freezing the browser or exhausting memory.
*   **Session-Aware Fetching**: Injects a secure download reader in the active tab's context to safely read blob data and auth-restricted secure HTTP/HTTPS resources using the user's active session cookie context.
*   **Automatic Timestamp Prepending**: Formats filenames automatically with local date/time stamps (e.g., `YYYY-MM-DD_HH.MM.SS-Filename.xlsx`) for seamless record-keeping.
*   **Vibrant Converter Dashboard**: Features a modern, elegant toolbar popup showing active conversion processes, conversion rates, and quick controls.

---

## 🛠️ Architecture & Workflow

Because Chrome Manifest V3 (MV3) restricts background service workers from accessing the DOM, `csv2xlsx` utilizes a high-performance **Offscreen Document** pattern to run heavy operations in a sandboxed, low-overhead container.

```mermaid
graph TD
    A["🌐 Web Page (CSV Download Triggered)"] -->|"1. Intercepts Download"| B["⚡ bg.js (Service Worker)"]
    B -->|"2. Spawns / Sends Data"| C["🖥️ offscreen.html / offscreen.js"]
    subgraph Offscreen Document Context (DOM & Web Worker access)
        C -->|"3. Parses CSV Stream"| D["📊 xlsx.full.min.js (SheetJS)"]
        D -->|"4. Generates Excel (.xlsx) Blob"| C
    end
    C -->|"5. Returns Blob URL"| B
    B -->|"6. Triggers Final Download with Prepend Timestamp"| E["💾 Local Disk (YYYY-MM-DD_HH.MM.SS-Filename.xlsx)"]
```

> [!TIP]
> **Why Offscreen Documents?**
> Standard Service Workers cannot access full DOM features (such as `FileReader`, `IndexedDB` file blobs, or synchronous encoding APIs) needed by heavy data utilities like `SheetJS`. By delegating parsing and Excel workbook creation to an offscreen context, the browser remains fast, responsive, and secure.

---

## 📂 Project Directory Structure

Below is the directory map of the project, highlighting the distinction between git-tracked extension source files and untracked/private packaging assets:

```text
.
├── csvtoexcelwithdate/       # Main Chrome Extension source folder (tracked by Git)
│   ├── bg.js                 # Background service worker (handles download interception & offscreen spawning)
│   ├── manifest.json         # Extension configuration (Manifest V3 metadata, permissions, & declarative rules)
│   ├── offscreen.html        # DOM environment required by SheetJS (xlsx) inside MV3
│   ├── offscreen.js          # Core engine (reads CSV chunks, parses contents, & compiles XLSX binaries)
│   ├── popup.html            # Extension popup UI (Vibrant dashboard panel)
│   ├── popup.js              # Controls interactions and real-time conversion logs in the popup dashboard
│   ├── xlsx.full.min.js      # SheetJS (xlsx) minified library for full Excel compilation
│   ├── icon.png              # Extension base visual icon
│   ├── icon16.png            # Icon for extension toolbar (16x16)
│   ├── icon48.png            # Icon for extension dashboard (48x48)
│   └── icon128.png           # Icon for extension management page (128x128)
├── csvtoexcelwithdate.crx    # Pre-packaged CRX archive for instant installation (untracked)
├── csvtoexcelwithdate.pem    # Chrome packaging private key (untracked - KEEP CONFIDENTIAL)
└── README.md                 # Extension documentation and developer guide (this file)
```

> [!WARNING]
> **Private Key Security**
> `csvtoexcelwithdate.pem` is your private signature key used to sign the packed extension. To prevent unauthorized extension updates, this file is ignored via `.gitignore` and **must never** be committed to public repositories.

---

## 📥 Installation

### Method A: Install via CRX Package (Fastest)

1.  Open **Google Chrome** or **Microsoft Edge**.
2.  Navigate to the extensions settings page:
    *   Chrome: [chrome://extensions](chrome://extensions)
    *   Edge: [edge://extensions](edge://extensions)
3.  Enable **Developer mode** using the toggle switch (typically top-right or bottom-left).
4.  Drag the `csvtoexcelwithdate.crx` file from your local disk and **drop it anywhere** on the extensions settings page.
5.  Confirm the prompt to install the extension.

### Method B: Load Unpacked Source (For Developers)

1.  Clone this repository or download the source directory.
2.  Navigate to [chrome://extensions](chrome://extensions) or [edge://extensions](edge://extensions).
3.  Enable **Developer mode** (toggle switch).
4.  Click the **Load unpacked** button in the top-left menu.
5.  Select the `csvtoexcelwithdate` folder from your local directory.
6.  The extension is now loaded and will auto-refresh upon file changes.

---

## 🛡️ License

This project is licensed under the MIT License - see the [LICENSE](#) file or details page for details.
