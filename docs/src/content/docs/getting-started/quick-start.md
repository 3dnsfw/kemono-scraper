---
title: Quick Start
description: Download your first creator's content in minutes
sidebar:
  order: 2
---

Let's download some content! This guide will walk you through your first download step by step.

## Before You Start

Make sure you have:
- Kemono Scraper [installed](/Kemono-Scraper/getting-started/installation/)
- The **creator's username or ID** from Kemono or Coomer
- The **service name** (like `patreon`, `onlyfans`, etc.)

## Finding Creator Information

### On Kemono (kemono.cr)

1. Go to [kemono.cr](https://kemono.cr)
2. Search for the creator you want
3. Look at the URL - it will look like:
   `https://kemono.cr/patreon/user/12345678`
   - The service is `patreon`
   - The user ID is `12345678`

### On Coomer (coomer.st)

1. Go to [coomer.st](https://coomer.st)
2. Search for the creator
3. Look at the URL - it will look like:
   `https://coomer.st/onlyfans/user/belledelphine`
   - The service is `onlyfans`
   - The user ID is `belledelphine`

## Running Your First Download

Open your terminal or command prompt and navigate to where you saved the scraper.

### Windows Example

:::tip[How to open Command Prompt or PowerShell on Windows]
- **Method 1**: Press `Win + R`, type `cmd` or `powershell`, then press Enter
- **Method 2**: Press `Win + X` and select "Windows PowerShell" or "Terminal"
- **Method 3**: Press `Win` key, type "Command Prompt" or "PowerShell", then press Enter
- **Method 4**: Right-click the Start button and select "Windows PowerShell" or "Terminal"
:::

Once you have Command Prompt or PowerShell open, navigate to the folder where you saved the scraper (for example, if it's in your Downloads folder, type `cd Downloads`), then run:

```bash
.\kemono-scraper-windows-x64.exe -s patreon -u 12345678
```

### Mac/Linux Example

```bash
./kemono-scraper-darwin-arm64 -s patreon -u 12345678
```

### Running from Source

If you installed from source:
```bash
bun start -s patreon -u 12345678
```

## What the Options Mean

| Option | What It Does | Example |
|--------|--------------|---------|
| `-s` or `--service` | The platform (patreon, onlyfans, etc.) | `-s patreon` |
| `-u` or `--userId` | The creator's ID or username | `-u 12345678` |
| `-h` or `--host` | The website (kemono.cr or coomer.st) | `-h coomer.st` |
| `-o` or `--outputDir` | Where to save files | `-o ./my-downloads` |

## Example: Download from Coomer

For creators on Coomer (OnlyFans, Fansly):

```bash
./kemono-scraper-darwin-arm64 -s onlyfans -u belledelphine --host coomer.st
```

## What Happens Next

1. The scraper will connect and find all available posts
2. Progress bars will show download status
3. Files are saved to `downloads-{username}/` by default
4. Already-downloaded files are automatically skipped

:::tip[Re-running is safe!]
You can run the same command again anytime. The scraper will skip files you already have, so it's safe to run regularly to check for new content.
:::

## Common Issues

### "Permission denied" on Mac/Linux
Make sure you ran `chmod +x` on the file first. See the [installation guide](/Kemono-Scraper/getting-started/installation/).

### "No posts found"
- Double-check the service name and user ID
- Make sure the creator exists on Kemono/Coomer

### Downloads are slow
This is normal - the sites have rate limits. Let it run, it will finish!

## Next Steps

- Learn about [configuration files](/Kemono-Scraper/usage/config-file/) to download from multiple creators
- Check out [all command line options](/Kemono-Scraper/usage/cli-options/)
- Set up [proxies](/Kemono-Scraper/usage/proxy/) if you have connection issues
