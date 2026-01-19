---
title: Basic Usage
description: Learn the fundamentals of using Kemono Scraper
sidebar:
  order: 1
---

This page covers the basic ways to use Kemono Scraper for everyday downloading.

## Single Creator Download

The simplest way to use the scraper is to download from one creator at a time.

### Basic Command

```bash
./kemono-scraper -s SERVICE -u USER_ID
```

Replace:
- `SERVICE` with the platform name (like `patreon`, `onlyfans`, etc.)
- `USER_ID` with the creator's ID or username

### Examples

**Download a Patreon creator from Kemono:**
```bash
./kemono-scraper -s patreon -u 30037948
```

**Download an OnlyFans creator from Coomer:**
```bash
./kemono-scraper -s onlyfans -u belledelphine --host coomer.st
```

**Download to a specific folder:**
```bash
./kemono-scraper -s fansly -u someuser -o ./my-downloads
```

## Supported Services

You can use any of these service names:

| Service | Example |
|---------|---------|
| `patreon` | `-s patreon` |
| `fanbox` | `-s fanbox` |
| `fantia` | `-s fantia` |
| `gumroad` | `-s gumroad` |
| `subscribestar` | `-s subscribestar` |
| `dlsite` | `-s dlsite` |
| `discord` | `-s discord` |
| `afdian` | `-s afdian` |
| `boosty` | `-s boosty` |
| `onlyfans` | `-s onlyfans` (use with `--host coomer.st`) |
| `fansly` | `-s fansly` (use with `--host coomer.st`) |
| `candfans` | `-s candfans` (use with `--host coomer.st`) |

## Supported Hosts

| Host | What It's For |
|------|---------------|
| `kemono.cr` | Default - Patreon, Fanbox, etc. |
| `coomer.st` | OnlyFans, Fansly, etc. |

:::tip[Which host to use?]
- For OnlyFans, Fansly, or Candfans: use `--host coomer.st`
- For everything else: leave it as default (kemono.cr)
:::

## Understanding the Output

When you run the scraper, you'll see:

1. **Connection info** - Shows which host it's using
2. **Post count** - How many posts it found
3. **Progress bars** - Shows download progress for each file
4. **Completion summary** - How many files downloaded/skipped

### Example Output

```
Using API host: kemono.cr
Fetched 50 posts (offset: 0)
Total posts so far: 50 (50 new, 0 duplicates)
Loaded 127 posts.
[█████████████████████] 100% | 42/42 Files
All files downloaded.
Last updated timestamp saved: Saturday, December 7, 2024, 3:45:32 PM EST
```

## Where Files Are Saved

By default, files are saved to:
```
downloads-{username}/
```

For example, if you download from user `12345678`, files go to:
```
downloads-12345678/
```

You can change this with the `-o` option:
```bash
./kemono-scraper -s patreon -u 12345678 -o ./custom-folder
```

## Limiting Downloads

### Limit Number of Posts

If you only want the most recent posts:
```bash
./kemono-scraper -s patreon -u 12345678 --maxPosts 100
```

This downloads only the 100 most recent posts.

### Set `--maxPosts 0` for Unlimited

To download everything (default is 5000 posts):
```bash
./kemono-scraper -s patreon -u 12345678 --maxPosts 0
```

## Re-running Downloads

It's completely safe to run the same command multiple times:

- Files you already have are **skipped automatically**
- Only **new content** gets downloaded
- **Failed downloads** are retried

This makes it easy to check for new content regularly!

## Next Steps

- Download from [multiple creators at once](/Kemono-Scraper/usage/config-file/)
- See [all command line options](/Kemono-Scraper/usage/cli-options/)
- Set up [proxies](/Kemono-Scraper/usage/proxy/) if needed
