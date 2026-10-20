<div align="center">

# Hmanager Pro

**A fast, intuitive, cross-platform Huawei LTE / 4G / 5G router controller and band locker.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Tauri v2](https://img.shields.io/badge/Tauri-v2.0-24C8D5?logo=tauri&logoColor=white)](https://v2.tauri.app/) [![Platforms](https://img.shields.io/badge/Platforms-Windows%20%7C%20Android%20%7C%20Linux%20%7C%20macOS%20%7C%20Web-blueviolet)](https://github.com/hmanager-pro) [![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/) [![Rust](https://img.shields.io/badge/Rust-1.80+-DEA584?logo=rust&logoColor=white)](https://rustup.rs/)

[Donate](https://ko-fi.com/w3simple/tip) 
[Key Features](#key-features) 
[Supported Routers](#supported-routers) 
[Getting Started](#getting-started) 
[Build from Source](#building-from-source) 
</div>

![Hmanager Pro Cover](https://raw.githubusercontent.com/devknown/hmanager-pro/master/hmanager.webp)

##  Overview
**Hmanager Pro** is a modern controller for Huawei HiLink and Flybox 4G/5G LTE routers (tested on B310s-22). It empowers users to monitor real-time cellular signal metrics, choose and lock optimal carrier frequency bands, control carrier aggregation, and send router commands seamlessly.

Help the project by donating:  **[Donate](https://ko-fi.com/w3simple/tip)**

Available as:
1. **Desktop App** (Windows `.exe` / `.msi`, Linux `.deb` / `.AppImage`, macOS `.dmg`) powered by **Tauri v2**.
2. **Mobile App** (Android `.apk`) with touch-friendly layout and responsive styling.
---

##  Key Features

-  **Carrier Band Locking**: Lock your router to specific LTE bands (e.g. B1, B3, B7, B20, B28, B38, B40, B41) to avoid congested frequencies and maximize throughput.
-  **Carrier Aggregation (CA)**: Enable and inspect multi-carrier aggregation combinations.
-  **Real-Time Signal Metrics**:
  - **RSRP** (Reference Signal Received Power)
  - **RSRQ** (Reference Signal Received Quality)
  - **SINR** (Signal-to-Interference-plus-Noise Ratio)
  - **RSSI** (Received Signal Strength Indicator)
  - **Cell ID, PCI, and eNodeB ID**
-  **Interactive Live Graphing**: Visual signal telemetry over time for precise antenna alignment.
-  **Multi-Platform Native Support**:
  - **Windows**: Lightweight NSIS installer and enterprise MSI package.
  - **Android**: ARM64 and universal APKs for on-the-go monitoring.
  - **Linux**: Debian packages (`.deb`) and standalone `.AppImage`.
  - **macOS**: Drag-and-drop DMG package.
-  **Privacy First**: Zero analytics, zero telemetry. Admin passwords and router traffic stay strictly between your device and your router.

---

<a id="supported-routers"></a>
## Supported Routers & Compatibility Matrix

Hmanager Pro is designed to communicate with Huawei HiLink-compatible routers and gateways via the Huawei HiLink XML/REST API protocol. It has been empirically verified and tested on the **Huawei B310s-22** (Hardware Version: `WL1B310FM03`, Firmware / Software Version: `21.318.01.02.314`, Orange Flybox / Open Market).

### Firmware Architecture & How Compatibility Works

Huawei's mobile broadband devices share a unified software and hardware platform family:

* **Firmware Platform (`21.xxx.xx.xx.xx`)**: The `21.` prefix designates Huawei's Linux-based **HiLink** embedded system (as opposed to legacy non-HiLink serial modem `11.x` sticks). Routers running firmware branches like `21.300`, `21.311`, `21.313`, `21.316`, `21.318`, `21.321`, `21.327`, `21.328`, `21.329`, and `21.333` expose the exact same core XML endpoints used by Hmanager Pro:
  * `/api/webserver/SesTokInfo` & `/api/user/state-login` (CSRF token & session management)
  * `/api/user/login` (Type 4 SHA-256 and RSA-2048 authentication)
  * `/api/device/signal` (Live RSRP, RSRQ, SINR, RSSI, Cell ID, PCI)
  * `/api/monitoring/status` & `/api/monitoring/traffic-statistics` (Connection state, data counters)
  * `/api/net/net-mode` & `/api/net/net-mode-list` (Carrier band locking & frequency interrogation)
* **Hardware Board Family (`WL1B310` / `WL1B315`)**: Powered by the HiSilicon Balong V7R11 chipset architecture. Sister models sharing this board revision or related Balong processors share identical command structures.
* **Carrier Suffix Codes**: The final segment of the software version (e.g. `21.318.01.02.314`) is the operator customization code (e.g. `.314` = Orange / Mobinil, `.372` = STC, `.284` = Airtel, `.59` = Zain, `.00` / `.01` = Generic Open Market, `.74` = Plus Poland). Hmanager Pro works across all operator variants as long as the router runs HiLink firmware.

---

### Full Compatibility Matrix

#### 1. Direct Firmware & Hardware Siblings (Balong V7R11 / 21.3xx Platform)
These models share the exact or near-identical motherboard architecture, baseband processor, and `21.318.xx` / `21.3xx.xx` firmware family as the tested **B310s-22**:

| Model Family | Specific Variants | Category | Supported Features |
|---|---|---|---|
| **Huawei B310 Series** | **B310s-22** *(Tested baseline)*, B310s-927, B310s-518, B310As-852 | LTE Cat 4 (150 Mbps) | Band Locking, Signal Metrics, PCI/Cell ID, Reboot |
| **Huawei B315 Series** | **B315s-22** *(Motherboard sibling)*, B315s-936, B315s-607, B315s-608, B315s-938 | LTE Cat 4 (150 Mbps) | Band Locking, Signal Metrics, PCI/Cell ID, Reboot |
| **Huawei B311 / B312 Series** | B311-221, B311s-220, B311-521, B311-522, B312-926, B316-855 | LTE Cat 4 (150 Mbps) | Band Locking, Signal Metrics, PCI/Cell ID, Reboot |
| **Huawei E5573 Series (MiFi)** | E5573s-320, E5573s-856, E5573s-606, E5573Cs-322, E5573Cs-609 | Mobile Cat 4 Hotspot | Band Locking, Signal Metrics, Battery State |
| **Huawei E5577 Series (MiFi)** | E5577s-321, E5577s-932, E5577Cs-321, E5575 | Mobile Cat 4 Hotspot | Band Locking, Signal Metrics, Battery State |
| **Huawei HiLink USB Dongles** | E3372h (E3372h-153, E3372h-607), E8372h (E8372h-153, E8372h-608, E8372h-927 Wingle), E3531 | USB Modem (HiLink mode) | Band Locking, Signal Metrics, Traffic Counters |

> [!NOTE]
> USB dongles (e.g. E3372, E8372) must run in **HiLink mode** (firmware `21.xxx.xx`). Legacy non-HiLink serial "Stick mode" firmware (`11.xxx.xx`) requires AT commands and cannot be queried via HTTP.

#### 2. Advanced LTE-A & Carrier Aggregation Routers (Cat 6 to Cat 19)
These higher-performance desktop gateways run upgraded Balong platforms (Balong 720 / 750 / 765) and WebUI 17+ / 21+ with full support for carrier aggregation (CA / 4G+) locking:

| Model Family | Specific Variants | Category | Supported Features |
|---|---|---|---|
| **Huawei B525 Series** | B525s-23a, B525s-65a (Firmware 21.327.xx / 21.328.xx / 21.332.xx) | LTE-A Cat 6 (300 Mbps) | Carrier Aggregation, Band Locking, Signal Metrics |
| **Huawei B528 / B529 Series** | B528s-23a (Vodafone GigaCube Cat 6), B529s-23a (HomeNet BOX) | LTE-A Cat 6 (300 Mbps) | Carrier Aggregation, Band Locking, Signal Metrics |
| **Huawei B535 Series** | B535-232 (4G Router 3 Pro), B535-333, B535-932, SoyeaLink B535-333 | LTE-A Cat 7 / Cat 13 | Carrier Aggregation, Band Locking, Signal Metrics |
| **Huawei B612 Series** | B612s-25d, B612s-51d, B612s-52d, B612-233 | LTE-A Cat 6 (300 Mbps) | Carrier Aggregation, Band Locking, Signal Metrics |
| **Huawei B618 Series** | B618s-22d, B618s-65d | LTE-A Cat 11 (600 Mbps) | Multi-Carrier CA, Band Locking, Signal Metrics |
| **Huawei B628 Series** | B628-265, B628-350 (4G CPE 3) | LTE-A Cat 12 (600 Mbps) | Multi-Carrier CA, Band Locking, Signal Metrics |
| **Huawei B715 Series** | B715s-23c | LTE-A Cat 9 (450 Mbps, 3CA) | 3CA Aggregation, Band Locking, Signal Metrics |
| **Huawei B818 Series** | B818-263 (4G Router 3 Prime) | LTE-A Cat 19 (1.6 Gbps) | 4CA/5CA Aggregation, Band Locking, Signal Metrics |
| **Huawei E5186 Series** | E5186s-22a, E5186s-61a | LTE-A Cat 6 (300 Mbps) | Carrier Aggregation, Band Locking, Signal Metrics |
| **Huawei E5180 Series** | E5180s-22 (Cube) | LTE Cat 4 (150 Mbps) | Band Locking, Signal Metrics |
| **Advanced Mobile MiFi** | E5785 (E5785Lh-22c, E5785-320a, E5785-330), E5786 (E5786s-32a), E5787 (Touch), E5788 (Gigabit), E5885 | Mobile Cat 6 / Cat 16 | CA Locking, Signal Metrics, Battery State |

#### 3. 5G CPE Gateways (Balong 5000 Series)
Huawei's sub-6GHz and mmWave 5G CPE lineup running EMUI / HarmonyOS Router WebUI with backward-compatible HiLink XML APIs:

| Model Family | Specific Variants | Supported Features |
|---|---|---|
| **Huawei 5G CPE Pro** | H112-370, H112-372 | 5G/4G Band Selection, NSA/SA Metrics, Signal Diagnostics |
| **Huawei 5G CPE Pro 2** | H122-373 (Wi-Fi 6+, Super Uplink) | 5G/4G Band Selection, NSA/SA Metrics, Signal Diagnostics |
| **Huawei 5G CPE Pro 3** | H138-380 | 5G/4G Band Selection, NSA/SA Metrics, Signal Diagnostics |
| **Huawei 5G CPE 6** | H165-383 | 5G/4G Band Selection, NSA/SA Metrics, Signal Diagnostics |
| **Huawei 5G CPE Win** | H312-371 (Outdoor directional) | 5G/4G Band Selection, Remote Antenna Alignment |
| **Huawei 5G Mobile WiFi** | E6878-370, E6878-870 (5G Mobile WiFi Pro) | 5G/4G Diagnostics, Band Monitoring, Battery State |

#### 4. Operator-Branded Router Aliases
Many major telecommunication providers rebrand Huawei routers under their own commercial names. As long as the underlying hardware matches one of the models above, Hmanager Pro will work seamlessly:
* **Orange**: Flybox 4G (B310s-22, B525s-23a, B535-232, B618)
* **Vodafone**: GigaCube Cat 6 (B528s-23a), GigaCube Cat 19 (B818-263), 5G GigaCube (H112-370)
* **Zain**: 4G Speedbox (B310s-927, B315s-936), 5G CPE Pro (H112-370, H122-373)
* **STC (Saudi Telecom)**: B310s-927, B525s-65a, B818-263, H112-370
* **Ooredoo / Djezzy / Mobilis**: B310s-22, B315s-22, B525s-23a
* **T-Mobile / Magenta**: HomeNet BOX (B529s-23a)
* **EE / 3 (Three UK)**: 4G Hub (B535-232), HomeFi (B310, B311)

---

### Known Incompatible Models

The following devices **cannot** be managed by Hmanager Pro due to incompatible firmware architecture:

| Device Model | Reason for Incompatibility |
|---|---|
| **Huawei B593 Series** *(B593u-12, B593s-22, etc.)* | Uses a legacy Linux/VxWorks web server with old CGI endpoints (`/goform/...`). Does not implement the modern `/api/...` HiLink XML endpoints. |
| **Huawei B2368 Series** *(B2368-22, B2368-66 Outdoor)* | Built on third-party CyberTAN / MediaTek firmware rather than the HiSilicon Balong HiLink stack. |
| **Huawei B683 / B681 / B970b** | Obsolete 3G gateways with legacy CGI interfaces. |
| **Modems in Serial "Stick Mode"** | Modems running firmware `11.xxx.xx` operate as virtual serial COM ports and must be cross-flashed to HiLink firmware `21.xxx.xx` to expose HTTP/XML endpoints. |

---

## Getting Started

```bash
# Install dependencies
npm install

# Start the web dashboard (auto-rebuilds Tailwind CSS & starts server)
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### Option C: Running the Tauri Desktop App

```bash
# Run in development mode with hot-reloading
npm run tauri:dev
```

---

## Building from Source

All build tasks route their compiled packages into a **single unified directory: `dist/`**.

### 1. Build Windows Installer (`.exe` & `.msi`)
```bash
npm run build:windows
```
Output:
- `dist/windows/Hmanager Pro_1.0.0_x64-setup.exe`
- `dist/windows/Hmanager Pro_1.0.0_x64_en-US.msi`
- Top-level copies in `dist/`

### 2. Build Android APK (`.apk`)
```bash
# Build release APK
npm run build:android

# Or explicitly debug APK
npm run build:android:debug
```
Output:
- `dist/android/Hmanager-Pro-arm64-release.apk`
- Top-level copy in `dist/`

### 3. Build Linux Package (`.deb` & `.AppImage`)
```bash
npm run build:linux
```
Output:
- `dist/linux/*.deb`
- `dist/linux/*.AppImage`

### 4. Build macOS Disk Image (`.dmg`)
```bash
npm run build:macos
```
Output:
- `dist/macos/*.dmg`

### 5. Build Everything & Collect Artifacts
```bash
# Builds desktop for current OS + Android APK
npm run build:all

# Collects and creates SHA256 checksums in dist/
npm run export
```

---

## Continuous Integration & Automated Releases

Hmanager Pro includes a battle-tested GitHub Actions CI/CD pipeline configured for automated cross-platform builds and releases:

- **Continuous Integration (`.github/workflows/build.yml`)**:
  - Automatically compiles and verifies **release versions** across all 4 platforms on every Pull Request and push to `main`/`master`:
    -  **Windows**: `.exe` NSIS setup & `.msi` WiX installer (on `windows-latest`)
    -  **Linux**: `.deb` package & `.AppImage` standalone binary (on `ubuntu-22.04`)
    -  **macOS**: `.dmg` Universal disk image supporting both Apple Silicon & Intel (on `macos-latest`)
    -  **Android**: Production-optimized ARM64 `.apk` (on `ubuntu-latest`)

- **Automated GitHub Releases (`.github/workflows/release.yml`)**:
  - Automatically triggered whenever a version tag is pushed (e.g. `git tag v1.0.0 && git push origin v1.0.0`) or manually triggered via **GitHub Actions `workflow_dispatch`**.
  - Compiles release builds across Windows, Linux, macOS, and Android.
  - Automatically computes cryptographic hashes into `SHA256SUMS.txt`.
  - Publishes an official GitHub Release with all platform installer files, checksums, and auto-generated changelog notes attached.

---

## License & Disclaimer

- **License**: This project is licensed under the [MIT License](LICENSE).
- **Disclaimer**: *Hmanager Pro* is an independent, community-driven open-source project and is not affiliated with, endorsed by, or associated with Huawei Technologies Co., Ltd. Router trademarks belong to their respective owners.