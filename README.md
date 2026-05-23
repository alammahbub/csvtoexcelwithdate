<p align="center">
  <img src="csvtoexcelwithdate/icon128.png" alt="csv2xlsx Logo" width="128" height="128" />
</p>

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
    subgraph "Offscreen Document Context (DOM & Web Worker access)"
        C -->|"3. Parses CSV Stream"| D["📊 xlsx.full.min.js (SheetJS)"]
        D -->|"4. Generates Excel (.xlsx) Blob"| C
    end
    C -->|"5. Returns Blob URL"| B
    B -->|"6. Triggers Final Download with Prepend Timestamp"| E["💾 Local Disk (YYYY-MM-DD_HH.MM.SS-Filename.xlsx)"]

    %% Premium Color Styles
    style A fill:#E3F2FD,stroke:#1565C0,stroke-width:2px,color:#0D47A1
    style B fill:#FFF3E0,stroke:#EF6C00,stroke-width:2px,color:#E65100
    style C fill:#EDE7F6,stroke:#673AB7,stroke-width:2px,color:#311B92
    style D fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px,color:#1B5E20
    style E fill:#E0F2F1,stroke:#00796B,stroke-width:2px,color:#004D40
```

> [!TIP]
> **Why Offscreen Documents?**
> Standard Service Workers cannot access full DOM features (such as `FileReader`, `IndexedDB` file blobs, or synchronous encoding APIs) needed by heavy data utilities like `SheetJS`. By delegating parsing and Excel workbook creation to an offscreen context, the browser remains fast, responsive, and secure.

---

## 📂 Project Directory Structure

Below is the directory map of the project:

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
└── README.md                 # Extension documentation and developer guide (this file)
```

---

## 📥 Installation

### Method A: Load Unpacked Source (Recommended)

This is the standard, most reliable method to run the extension, avoiding signature verification blocks on custom builds:

1.  Clone this repository or download the source directory.
2.  Navigate to the extensions settings page:
    *   Chrome: [chrome://extensions](chrome://extensions)
    *   Edge: [edge://extensions](edge://extensions)
3.  Enable **Developer mode** using the toggle switch in the top-right corner.
4.  Click the **Load unpacked** button in the top-left menu.
5.  Select the `csvtoexcelwithdate` folder from your local directory.
6.  The extension is now loaded and will auto-refresh upon file changes.

### Method B: Install via CRX Package (Alternate)

> [!CAUTION]
> **Signature Proof Block (`CRX_REQUIRED_PROOF_MISSING`)**
> Starting in modern Chromium versions (Chrome 117+ / Edge 117+), dragging and dropping locally packaged `.crx` files is blocked with an **invalid package** or **proof required** error to prevent sideloading unauthorized software. 
> 
> **To run this custom build, we highly recommend using the "Load Unpacked Source" method (Method A) above.**

If you are running an older browser version or have group policies configured to allow local unsigned installations:

1.  Open **Google Chrome** or **Microsoft Edge**.
2.  Navigate to the extensions settings page.
3.  Enable **Developer mode** using the toggle switch.
4.  Drag the `csvtoexcelwithdate.crx` file from your local disk and **drop it anywhere** on the extensions settings page.
5.  Confirm the prompt to install the extension.

---

## 🛡️ License

This project is licensed under the MIT License - see the [LICENSE](#) file or details page for details.
