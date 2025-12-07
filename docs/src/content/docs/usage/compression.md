---
title: Compression
description: Compress downloaded media files to save disk space
sidebar:
  order: 5
---

After downloading files, you can compress them to save significant disk space. The scraper includes a built-in compression script that converts images and videos to more efficient formats.

## What Gets Compressed

The compression script automatically processes:

- **Images**: JPG/JPEG → JPEG XL (typically 30-50% smaller)
- **Videos**: MP4 → AV1 (typically 30-50% smaller)

The scraper automatically detects compressed files on subsequent runs, so you won't re-download files that have already been compressed.

## Requirements

Before you can use compression, you need to install the required tools:

### libjxl (for JPEG XL)

**Linux:**

```bash
# Arch Linux / Manjaro
paru -S libjxl
# or
sudo pacman -S libjxl

# Debian / Ubuntu
sudo apt install libjxl-tools
```

**Windows:**

```powershell
winget install --id=libjxl.libjxl -e
```

**macOS:**

```bash
brew install jpeg-xl
```

### ffmpeg (with SVT-AV1 support)

**Linux:**

```bash
# Arch Linux / Manjaro
paru -S ffmpeg
# or
sudo pacman -S ffmpeg

# Debian / Ubuntu
sudo apt install ffmpeg
```

**Windows:**

```powershell
winget install ffmpeg
```

**macOS:**

```bash
brew install ffmpeg
```

:::tip[Verify Installation]
Check that the tools are installed correctly:

```bash
cjxl --version
ffmpeg -version
```

:::

## Running Compression

### Basic Usage

Navigate to your project directory and run:

```bash
bun run compress
```

This will compress all eligible files in your download directories.

### On Windows PowerShell

You can also use the PowerShell script:

```powershell
.\compress.ps1
```

### On Windows/Linux/Mac (Shell Script)

```bash
./compress.sh
```

## Configuration

You can customize compression settings using environment variables:

### Environment Variables

```bash
JPEG_XL_QUALITY=95 AV1_CRF=28 bun run compress
```

| Variable | Default | Description |
|----------|---------|-------------|
| `JPEG_XL_QUALITY` | 90 | JPEG XL quality (1-100, higher = better quality) |
| `JPEG_XL_EFFORT` | 7 | Encoding effort (1-9, higher = slower but smaller files) |
| `AV1_CRF` | 30 | AV1 quality (lower = better, 18-35 typical range) |
| `AV1_PRESET` | 6 | SVT-AV1 preset (0-13, lower = slower but better quality) |

### Windows PowerShell Parameters

On Windows PowerShell, you can pass parameters directly:

```powershell
.\compress.ps1 -JpegXlQuality 95 -Av1Crf 28
```

## Understanding Quality Settings

### JPEG XL Quality

- **Lower values (70-85)**: Smaller files, slight quality loss
- **Default (90)**: Good balance of quality and size
- **Higher values (95-100)**: Near-lossless, larger files

### JPEG XL Effort

- **Lower (1-3)**: Fast encoding, larger files
- **Default (7)**: Good balance
- **Higher (8-9)**: Slow encoding, smallest files

### AV1 CRF (Constant Rate Factor)

- **Lower (18-25)**: Higher quality, larger files
- **Default (30)**: Good balance
- **Higher (31-35)**: Lower quality, smaller files

### AV1 Preset

- **Lower (0-3)**: Slowest encoding, best quality
- **Default (6)**: Good balance
- **Higher (10-13)**: Fast encoding, slightly lower quality

## Examples

### High Quality Compression

For maximum quality (larger files):

```bash
JPEG_XL_QUALITY=98 JPEG_XL_EFFORT=9 AV1_CRF=25 AV1_PRESET=4 bun run compress
```

### Maximum Compression

For smallest file sizes (some quality loss):

```bash
JPEG_XL_QUALITY=85 JPEG_XL_EFFORT=9 AV1_CRF=32 AV1_PRESET=8 bun run compress
```

### Balanced (Default)

The default settings provide a good balance:

```bash
bun run compress
```

## How It Works

1. The script scans your download directories for uncompressed files
2. Images (JPG/JPEG) are converted to `.jxl` format
3. Videos (MP4) are converted to `_av1.mp4` format
4. Original files are preserved alongside compressed versions
5. On subsequent scraper runs, compressed files are detected and skipped

:::note
The original files are kept. You can delete them manually after verifying the compressed versions work correctly.
:::

## Troubleshooting

### "Command not found: cjxl"

Make sure `libjxl` is installed and in your PATH. Verify with:

```bash
which cjxl
```

### "ffmpeg: command not found"

Install `ffmpeg` and ensure it's in your PATH:

```bash
which ffmpeg
```

### Compression is very slow

- Lower `JPEG_XL_EFFORT` (try 5-6)
- Increase `AV1_PRESET` (try 8-10)
- Process files in smaller batches

### Files are too large after compression

- Lower `JPEG_XL_QUALITY` (try 85-90)
- Increase `AV1_CRF` (try 32-35)

### Files are too small / quality is poor

- Increase `JPEG_XL_QUALITY` (try 95-98)
- Lower `AV1_CRF` (try 25-28)

## Next Steps

- Learn about [basic usage](/Kemono-Scraper/usage/basic/) for downloading files
- See [command line options](/Kemono-Scraper/usage/cli-options/) for more control
