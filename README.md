# Kemono / Coomer Scraper

Download all media from Kemono and Coomer. Scrapes posts from a given service and user, downloading all attachments into a specified folder.

## Features

- Scrapes posts from various services (Patreon, OnlyFans, Fansly, etc.)
- Downloads attachments while checking for existing files
- Supports multiple hosts and CDN failover
- Progress bars with percentage and ETA
- Blacklist system for permanently failed downloads
- **Standalone executables** — no runtime required
- **Media compression** — convert images to JPEG XL and videos to AV1

## Quick Start

### Option 1: Download Pre-built Executable (Recommended)

Download the latest release for your platform from [GitHub Releases](../../releases):

| Platform | File |
|----------|------|
| Linux x64 | `kemono-scraper-linux-x64` |
| Linux ARM64 | `kemono-scraper-linux-arm64` |
| Windows x64 | `kemono-scraper-windows-x64.exe` |
| macOS Intel | `kemono-scraper-darwin-x64` |
| macOS Apple Silicon | `kemono-scraper-darwin-arm64` |

```bash
# Linux/macOS - make executable
chmod +x kemono-scraper-*

# Run
./kemono-scraper-linux-x64 -s onlyfans -u belledelphine
```

### Option 2: Run from Source

Requires [Bun](https://bun.sh) installed.

```bash
# Clone and install
git clone https://github.com/3dnsfw/kemono-scraper.git
cd kemono-scraper
bun install

# Run
bun start -s patreon -u 30037948
```

## Usage

### Command-Line Arguments

| Argument | Alias | Description | Required |
|----------|-------|-------------|----------|
| `--service` | `-s` | Service to scrape from | Yes |
| `--userId` | `-u` | User ID to scrape | Yes |
| `--host` | `-h` | Base host (default: `kemono.cr`) | No |
| `--outputDir` | `-o` | Output directory (default: `downloads-%username%`) | No |
| `--maxPosts` | `-m` | Max posts to fetch (default: 5000, 0 = unlimited) | No |

**Supported services:** `patreon`, `fanbox`, `discord`, `fantia`, `afdian`, `boosty`, `gumroad`, `subscribestar`, `onlyfans`, `fansly`, `candfans`

**Supported hosts:** `kemono.cr`, `coomer.st`, `kemono.su`, `coomer.su`

### Examples

```bash
# Scrape a Patreon creator from Kemono
bun start -s patreon -u 30037948

# Scrape from Coomer
bun start -s onlyfans -u belledelphine --host coomer.st

# Custom output directory
bun start -s fansly -u someuser -o ./my-downloads

# Using the standalone executable
./kemono-scraper-linux-x64 -s onlyfans -u belledelphine --host coomer.st
```

## Building Executables

Build standalone executables that run without Bun installed:

```bash
# Build all platforms
bun run build

# Build specific platform
bun run build:linux      # Linux x64
bun run build:linux-arm  # Linux ARM64
bun run build:windows    # Windows x64
bun run build:macos      # macOS x64
bun run build:macos-arm  # macOS ARM64
```

Executables are output to the `dist/` directory.

## Compression

After downloading, compress media files to save disk space:

- **Images**: JPG/JPEG → JPEG XL (typically 30-50% smaller)
- **Videos**: MP4 → AV1 (typically 30-50% smaller)

The scraper automatically detects compressed files on subsequent runs.

### Requirements

- **libjxl** for JPEG XL (`cjxl` command)
  - Linux: `paru -S libjxl` or `apt install libjxl-tools`
  - Windows: `winget install --id=libjxl.libjxl -e`
- **ffmpeg** with SVT-AV1 support
  - Linux: `paru -S ffmpeg` or `apt install ffmpeg`
  - Windows: `winget install ffmpeg`

### Running Compression

```bash
bun run compress
```

### Configuration

Set environment variables to customize compression:

```bash
JPEG_XL_QUALITY=95 AV1_CRF=28 bun run compress
```

| Variable | Default | Description |
|----------|---------|-------------|
| `JPEG_XL_QUALITY` | 90 | JPEG XL quality (1-100, higher = better) |
| `JPEG_XL_EFFORT` | 7 | Encoding effort (1-9, higher = slower but smaller) |
| `AV1_CRF` | 30 | AV1 quality (lower = better, 18-35 typical) |
| `AV1_PRESET` | 6 | SVT-AV1 preset (0-13, lower = slower but better) |

On Windows PowerShell:

```powershell
.\compress.ps1 -JpegXlQuality 95 -Av1Crf 28
```

## License

MIT
