---
title: FAQ
description: Frequently asked questions about Kemono Scraper
sidebar:
  order: 1
---

Here are answers to common questions about using Kemono Scraper.

## General Questions

### What is Kemono Scraper?

Kemono Scraper is a free, open-source tool that downloads media files (images, videos) from creators on Kemono and Coomer websites. It automates what would otherwise be tedious manual downloading.

### Is it free?

Yes! Kemono Scraper is completely free and open-source. You can view the code on [GitHub](https://github.com/3dnsfw/kemono-scraper).

### What platforms are supported?

**Through Kemono:**
- Patreon
- Fanbox
- Fantia
- Gumroad
- SubscribeStar
- DLsite
- Discord
- Afdian
- Boosty

**Through Coomer:**
- OnlyFans
- Fansly
- Candfans

### Do I need programming knowledge?

No! Just download the pre-built executable and run it. No coding required.

---

## Downloads & Files

### Where are my files saved?

By default, files are saved to a folder named `downloads-{username}/` in the same directory as the scraper.

You can change this with the `-o` option:
```bash
./kemono-scraper -s patreon -u 12345678 -o ./my-folder
```

### Can I re-run the scraper safely?

Yes! Running the scraper again will:
- **Skip** files you already have
- **Download** only new content
- **Retry** any previously failed downloads

It's safe to run as often as you like.

### What file types are downloaded?

The scraper downloads whatever the creator uploaded:
- Images (JPG, PNG, GIF, WEBP, etc.)
- Videos (MP4, WEBM, etc.)
- Other attachments

### How do I know if downloads are complete?

The scraper shows progress bars and a summary at the end:
```
All files downloaded.
Last updated timestamp saved: Saturday, December 7, 2024, 3:45:32 PM EST
```

Check the `lastupdated.txt` file in your download folder to see when you last ran the scraper.

### Can I compress the downloaded files?

Yes! After downloading, you can use the built-in compression script:

```bash
bun run compress
```

This converts:
- JPG/JPEG → JPEG XL (30-50% smaller)
- MP4 → AV1 (30-50% smaller)

See the [README](https://github.com/3dnsfw/kemono-scraper#compression) for requirements.

---

## Troubleshooting

### Why do some downloads fail?

Downloads can fail for several reasons:
- **Rate limiting** - Too many requests, try again later
- **File unavailable** - The file was removed from the server
- **Connection issues** - Network problems, try again

The scraper automatically retries failed downloads. Files that consistently fail are added to a "blacklist" and skipped.

### What is the blacklist?

When a file fails to download 5 times, it's added to `blacklist.json` in your download folder. This prevents the scraper from wasting time on files that don't exist.

The blacklist automatically expires after 2 days, so files will be retried eventually.

### Why is downloading slow?

The sites have rate limits to prevent abuse. The scraper automatically:
- Pauses between requests
- Limits concurrent downloads
- Waits when rate limited

This is normal and helps prevent your IP from being blocked.

### "No posts found" error

This usually means:
1. The service or user ID is wrong
2. The creator doesn't exist on Kemono/Coomer
3. You're using the wrong host (e.g., using kemono.cr for OnlyFans)

Double-check your command and try again.

### Mac says the app is from an unidentified developer

1. Go to **System Preferences** → **Security & Privacy**
2. Click **General** tab
3. Click **Allow Anyway** next to the message about the app
4. Try running it again

---

## Configuration

### How do I download from multiple creators?

Create a config file! See the [Configuration File guide](/kemono-scraper/usage/config-file/).

```yaml
creators:
  - service: patreon
    userId: "12345678"
  - service: fanbox
    userId: "somecreator"
```

Then run:
```bash
./kemono-scraper -c config.yaml
```

### How do I use Coomer (for OnlyFans)?

Add `--host coomer.st` to your command:

```bash
./kemono-scraper -s onlyfans -u username --host coomer.st
```

Or in your config file:
```yaml
creators:
  - service: onlyfans
    userId: "username"
    host: coomer.st
```

### Do I need proxies?

Most users don't need proxies. Try without them first. Only set up proxies if you're:
- Getting blocked frequently
- Experiencing consistent connection issues
- Need to route traffic through specific locations

---

## Technical Questions

### What language is it written in?

TypeScript, running on [Bun](https://bun.sh).

### Can I contribute?

Yes! Contributions are welcome. Check out the [GitHub repository](https://github.com/3dnsfw/kemono-scraper).

### How do I report bugs?

Open an issue on [GitHub](https://github.com/3dnsfw/kemono-scraper/issues) with:
- What you were trying to do
- The command you ran
- Any error messages

### How do I request features?

Open an issue on [GitHub](https://github.com/3dnsfw/kemono-scraper/issues) describing what you'd like to see!
