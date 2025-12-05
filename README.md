# Kemono / Coomer Scraper

This project downloads all images from the API. It scrapes posts from a given service and user, and downloads all attachments into a specified folder.

## Features

- Scrapes posts from various services
- Downloads attachments while checking for existing files
- Supports multiple hosts and CDN hosts
- Displays a progress bar with percentage and ETA
- **Media compression**: Convert images to JPEG XL and videos to AV1 to save disk space

## Installation

1. Clone the repository:

    ```sh
    git clone https://github.com/3dnsfw/kemono-scraper.git
    cd kemono-scraper
    ```

2. Install the required dependencies:

    ```sh
    pnpm i
    ```

## Usage

### Command-Line Arguments

- `--service, -s`: The service to scrape from (choices: `patreon`, `fanbox`, `discord`, `fantia`, `afdian`, `boosty`, `gumroad`, `subscribestar`, `onlyfans`, `fansly`, `candfans`) (required)
- `--userId, -u`: The user ID to scrape from (required)
- `--host, -h`: The base host to scrape from (subdomains will be tried automatically) (choices: `kemono.su`, `coomer.su`, `kemono.cr`, `coomer.st`) (default: `kemono.cr`)

### Example

```sh
pnpm start -s patreon -u 30037948
```

#### Custom Hosts

You can also specify a different base host (subdomains will be tried automatically):

```sh
pnpm start -s onlyfans -u belledelphine --host coomer.st
```

## Compression

After downloading, you can compress media files to save disk space. This converts:

- **Images**: JPG/JPEG → JPEG XL (typically 30-50% smaller)
- **Videos**: MP4 → AV1 (typically 30-50% smaller, skips if already AV1)

The scraper automatically detects compressed files on subsequent runs, so it won't re-download files that have been compressed.

### Requirements

- **libjxl** for JPEG XL conversion (`cjxl` command)
  - Linux: `paru -S libjxl` or `apt install libjxl-tools`
  - Windows: `winget install --id=libjxl.libjxl -e`
- **ffmpeg** with SVT-AV1 support
  - Linux: `paru -S ffmpeg` or `apt install ffmpeg`
  - Windows: `winget install ffmpeg`

### Running Compression

```sh
pnpm compress
```

The script automatically detects your OS and runs the appropriate version (bash or PowerShell).

### Configuration

Set environment variables to customize compression (Linux/macOS):

```sh
JPEG_XL_QUALITY=95 AV1_CRF=28 pnpm compress
```

| Variable | Default | Description |
|----------|---------|-------------|
| `JPEG_XL_QUALITY` | 90 | JPEG XL quality (1-100, higher = better) |
| `JPEG_XL_EFFORT` | 7 | Encoding effort (1-9, higher = slower but smaller) |
| `AV1_CRF` | 30 | AV1 quality (lower = better, 18-35 typical) |
| `AV1_PRESET` | 6 | SVT-AV1 preset (0-13, lower = slower but better) |

On Windows, edit the defaults in `compress.ps1` or run directly:

```powershell
.\compress.ps1 -JpegXlQuality 95 -Av1Crf 28
```
