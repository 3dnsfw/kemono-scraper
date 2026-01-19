---
title: Troubleshooting
description: Solutions for common problems with Kemono Scraper
sidebar:
  order: 2
---

Having issues? This page covers common problems and how to fix them.

## Installation Issues

### "Command not found" (Mac/Linux)

The executable needs to be run with `./` prefix:

```bash
# Wrong
kemono-scraper -s patreon -u 12345

# Correct
./kemono-scraper -s patreon -u 12345
```

### "Permission denied" (Mac/Linux)

You need to make the file executable first:

```bash
chmod +x kemono-scraper-darwin-arm64
```

Replace the filename with your actual file.

### Mac blocks the app ("unidentified developer")

**Solution:**

1. Open **System Preferences** (or **System Settings** on newer Macs)
2. Go to **Security & Privacy** (or **Privacy & Security**)
3. Click the **General** tab
4. Near the bottom, you'll see a message about the blocked app
5. Click **Allow Anyway** or **Open Anyway**
6. Try running the app again

**Alternative:** Right-click the app and select "Open" instead of double-clicking.

### Windows Defender blocks the executable

Windows may flag unknown executables. To allow it:

1. Click **More info** on the warning
2. Click **Run anyway**

Or add an exception in Windows Defender settings.

---

## Connection Issues

### "Could not find a working API host"

**Causes:**
- The site is down or experiencing issues
- Your IP might be blocked
- Network connectivity problems

**Solutions:**

1. **Try a different host:**
   ```bash
   ./kemono-scraper -s patreon -u 12345 --host kemono.cr
   ```

2. **Wait and try again** - The site might be temporarily down

3. **Check if the site works in your browser** - Visit kemono.cr directly

### "Rate limited (429)"

You're making too many requests. The scraper handles this automatically by waiting, but if it happens frequently:

1. **Reduce concurrent downloads:**
   ```bash
   ./kemono-scraper -s patreon -u 12345 -d 1
   ```

2. **Wait a few minutes** before running again

3. **Consider using proxies** for heavy usage

### Downloads keep failing with timeout

**Solutions:**

1. **Check your internet connection**

2. **Try reducing concurrent downloads:**
   ```bash
   ./kemono-scraper -s patreon -u 12345 -d 1
   ```

3. **The file might be corrupted on the server** - It will eventually be blacklisted and skipped

---

## Download Issues

### "No posts found" (404)

**Causes:**
- Wrong service or user ID
- Creator doesn't exist on Kemono/Coomer
- Using wrong host

**Solutions:**

1. **Verify the creator exists** - Visit the site in your browser
   
2. **Check your command:**
   ```bash
   # Make sure service and userId are correct
   ./kemono-scraper -s patreon -u 30037948
   ```

3. **Use the right host:**
   - Kemono (kemono.cr): patreon, fanbox, fantia, etc.
   - Coomer (coomer.st): onlyfans, fansly, candfans

### Some files are being skipped

Files are skipped if:

1. **They already exist** - Check your download folder
2. **They're blacklisted** - Previously failed 5+ times
3. **Compressed version exists** - `.jxl` or `_av1.mp4` variant

To retry blacklisted files, delete `blacklist.json` from your download folder.

### Downloads stuck at 0%

**Causes:**
- Server is slow or unresponsive
- Network issues
- File might not exist

**Solutions:**

1. **Wait** - The scraper has built-in timeout handling
2. **Cancel and retry** - Press Ctrl+C and run again
3. **Check if site is working** - Try accessing kemono.cr in your browser

### Wrong files being downloaded

Make sure you have the correct user ID. Check the URL on Kemono/Coomer:

```
https://kemono.cr/patreon/user/12345678
                              ^^^^^^^^
                              This is the user ID
```

---

## Config File Issues

### "Config file not found"

Check:
1. The file exists
2. You're providing the correct path
3. You're in the right directory

```bash
# Use full path if needed
./kemono-scraper -c /full/path/to/config.yaml
```

### "YAML parsing error"

Common YAML mistakes:

1. **Wrong indentation** - Use spaces, not tabs:
   ```yaml
   # Wrong (tabs)
   creators:
   	- service: patreon  # Tab here!
   
   # Correct (spaces)
   creators:
     - service: patreon  # Spaces
   ```

2. **Missing quotes on IDs:**
   ```yaml
   # Can cause issues
   userId: 12345678
   
   # Better
   userId: "12345678"
   ```

3. **Special characters need quotes:**
   ```yaml
   # Might fail
   outputDir: C:\Downloads\stuff
   
   # Correct
   outputDir: "C:\\Downloads\\stuff"
   ```

### "creators array required"

Your config file needs at least one creator:

```yaml
creators:
  - service: patreon
    userId: "12345678"
```

---

## Performance Issues

### Downloads are very slow

This is often normal due to rate limiting. But you can try:

1. **Use multiple proxies** to distribute requests
2. **Run during off-peak hours**
3. **Be patient** - Large archives take time

### Memory usage is high

Try reducing concurrent downloads:
```bash
./kemono-scraper -s patreon -u 12345 -d 1
```

### Disk is filling up

Large creators can have hundreds of gigabytes of content. Monitor your disk space and consider:

1. Using `--maxPosts` to limit downloads
2. Downloading to an external drive
3. [Compressing files after download](/Kemono-Scraper/usage/compression/) to save 30-50% disk space

---

## Still Having Issues?

If none of these solutions work:

1. **Check the [GitHub issues](https://github.com/3dnsfw/kemono-scraper/issues)** - Your problem might already be reported

2. **Open a new issue** with:
   - The exact command you ran
   - The complete error message
   - Your operating system
   - Any relevant logs

3. **Include debug info** by running with verbose output:
   ```bash
   DEBUG_PROXY=1 ./kemono-scraper -c config.yaml 2>&1 | tee debug.log
   ```
