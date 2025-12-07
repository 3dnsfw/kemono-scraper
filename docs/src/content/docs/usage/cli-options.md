---
title: Command Line Options
description: Complete reference for all command line options
sidebar:
  order: 3
---

This page lists all available command line options for Kemono Scraper.

## Quick Reference

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--config` | `-c` | Path to config file | - |
| `--service` | `-s` | Service to scrape from | - |
| `--userId` | `-u` | User ID to scrape | - |
| `--host` | `-h` | Base host | `kemono.cr` |
| `--outputDir` | `-o` | Output directory | `downloads-%username%` |
| `--maxPosts` | `-m` | Max posts to fetch | `5000` |
| `--maxConcurrentDownloads` | `-d` | Concurrent downloads | `2` |
| `--help` | | Show help | - |
| `--version` | | Show version | - |

## Subcommands

- `scrape` (default): Download content from Kemono/Coomer (all options in the table above).
- `compress`: Compress media in `downloads-*` folders using JPEG XL and AV1.

## Compression Command Options

| Option | Description | Default | Env Var |
|--------|-------------|---------|---------|
| `--jpegXlQuality` | JPEG XL quality (1-100) | `90` | `JPEG_XL_QUALITY` |
| `--jpegXlEffort` | JPEG XL effort (1-9) | `5` | `JPEG_XL_EFFORT` |
| `--av1Crf` | AV1 CRF (lower = higher quality) | `30` | `AV1_CRF` |
| `--av1Preset` | AV1 preset (0-13, lower = slower) | `6` | `AV1_PRESET` |
| `--keepOriginals` / `--no-keepOriginals` | Keep originals after compression | `true` | `KEEP_ORIGINALS` |
| `--dryRun` | Show actions without modifying files | `false` | - |

## Detailed Options

### `--config` / `-c`

Path to a YAML configuration file.

```bash
./kemono-scraper --config config.yaml
./kemono-scraper -c ./my-config.yaml
```

When using a config file, `--service` and `--userId` are not needed.

---

### `--service` / `-s`

The platform to download from. Required unless using `--config`.

**Available services:**

| For Kemono | For Coomer |
|------------|------------|
| `patreon` | `onlyfans` |
| `fanbox` | `fansly` |
| `fantia` | `candfans` |
| `gumroad` | |
| `subscribestar` | |
| `dlsite` | |
| `discord` | |
| `afdian` | |
| `boosty` | |

```bash
./kemono-scraper -s patreon -u 12345678
./kemono-scraper -s onlyfans -u username --host coomer.st
```

---

### `--userId` / `-u`

The creator's ID or username. Required unless using `--config`.

```bash
# Numeric ID
./kemono-scraper -s patreon -u 12345678

# Username
./kemono-scraper -s onlyfans -u belledelphine --host coomer.st
```

:::tip
Find the user ID in the URL on Kemono/Coomer. For example:
`https://kemono.su/patreon/user/12345678` → ID is `12345678`
:::

---

### `--host` / `-h`

The base website to scrape from.

**Available hosts:**

| Host | Use For |
|------|---------|
| `kemono.cr` | Patreon, Fanbox, Fantia, etc. (default) |
| `kemono.su` | Backup Kemono domain |
| `coomer.st` | OnlyFans, Fansly, Candfans |
| `coomer.su` | Backup Coomer domain |

```bash
# Use Coomer for OnlyFans
./kemono-scraper -s onlyfans -u username --host coomer.st

# Use backup Kemono domain
./kemono-scraper -s patreon -u 12345678 --host kemono.su
```

---

### `--outputDir` / `-o`

Where to save downloaded files. 

The special string `%username%` is replaced with the user ID.

**Default:** `downloads-%username%`

```bash
# Custom folder
./kemono-scraper -s patreon -u 12345678 -o ./my-downloads

# Custom folder with username
./kemono-scraper -s patreon -u 12345678 -o ./patreon/%username%
```

---

### `--maxPosts` / `-m`

Maximum number of posts to fetch.

**Default:** `5000`

```bash
# Only download from last 100 posts
./kemono-scraper -s patreon -u 12345678 --maxPosts 100

# Download everything (no limit)
./kemono-scraper -s patreon -u 12345678 --maxPosts 0
```

---

### `--maxConcurrentDownloads` / `-d`

How many files to download simultaneously.

**Default:** `2`  
**Range:** `1` to `10`

```bash
# Download 4 files at once
./kemono-scraper -s patreon -u 12345678 -d 4

# Download one at a time (slower but gentler on servers)
./kemono-scraper -s patreon -u 12345678 -d 1
```

:::caution
Higher values may trigger rate limiting. Stick with 2-4 for best results.
:::

---

### `--help`

Show help information with all options.

```bash
./kemono-scraper --help
```

---

### `--version`

Show the version number.

```bash
./kemono-scraper --version
```

## Usage Modes

### Mode 1: Command Line Arguments

Specify everything on the command line:

```bash
./kemono-scraper -s patreon -u 12345678 -o ./downloads -m 500
```

### Mode 2: Config File

Use a YAML config file:

```bash
./kemono-scraper -c config.yaml
```

### Mode 3: Mixed (Config + Overrides)

Config file options can be combined with CLI arguments, but you generally use one or the other.

## Environment Variables

### `DEBUG_PROXY`

Enable verbose proxy logging:

```bash
DEBUG_PROXY=1 ./kemono-scraper -c config.yaml
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (check console output) |

## Examples

### Basic Download
```bash
./kemono-scraper -s patreon -u 30037948
```

### OnlyFans from Coomer
```bash
./kemono-scraper -s onlyfans -u belledelphine -h coomer.st
```

### Limited Download to Custom Folder
```bash
./kemono-scraper -s fanbox -u creator -o ./fanbox -m 50
```

### Using Config File
```bash
./kemono-scraper -c my-config.yaml
```

### Show Help
```bash
./kemono-scraper --help
```


