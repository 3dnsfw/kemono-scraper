---
title: Configuration File
description: Download from multiple creators using a config file
sidebar:
  order: 2
---

If you want to download from multiple creators regularly, using a configuration file makes things much easier!

## Why Use a Config File?

- Download from **multiple creators** in one command
- **Save your settings** so you don't have to remember them
- Set **different options** for different creators
- Easy to **add or remove** creators

## Creating Your Config File

### Step 1: Copy the Example

The scraper comes with an example config file. Copy it if you installed from source:

```bash
cp config.example.yaml config.yaml
```

Otherwise you can [download it from here](https://raw.githubusercontent.com/3dnsfw/Kemono-Scraper/refs/heads/master/config.example.yaml) (open the link and press `CTRL` + `S` to save the file)

### Step 2: Edit the File

Open `config.yaml` in any text editor (Notepad, TextEdit, VS Code, etc.).

### Basic Config Example

Here's a simple configuration:

```yaml
# Global settings (apply to all creators unless overridden)
host: kemono.cr
outputDir: downloads-%username%
maxPosts: 5000

# List of creators to download from
creators:
  - service: patreon
    userId: "12345678"
  
  - service: fanbox
    userId: "somecreator"
  
  - service: onlyfans
    userId: "belledelphine"
    host: coomer.st  # This creator needs Coomer
```

### Running with Config

```bash
./kemono-scraper --config config.yaml
```

Or shorter:
```bash
./kemono-scraper -c config.yaml
```

## Config File Options

### Global Settings

These apply to all creators (unless a creator overrides them):

```yaml
# Which site to use (kemono.cr or coomer.st)
host: kemono.cr

# Where to save files (%username% gets replaced with creator ID)
outputDir: downloads-%username%

# Maximum posts to download (0 = unlimited)
maxPosts: 5000

# How many files to download at once (1-10)
maxConcurrentDownloads: 2
```

### Creator Settings

Each creator needs at least `service` and `userId`:

```yaml
creators:
  - service: patreon
    userId: "12345678"
```

You can override global settings per creator:

```yaml
creators:
  - service: patreon
    userId: "12345678"
    outputDir: ./patreon-stuff    # Different folder
    maxPosts: 100                  # Only get 100 posts
  
  - service: onlyfans
    userId: "someuser"
    host: coomer.st               # Different host
```

## Complete Example

Here's a full config file with multiple creators:

```yaml
# ================================
# Kemono Scraper Configuration
# ================================

# Global defaults
host: kemono.cr
outputDir: downloads-%username%
maxPosts: 5000
maxConcurrentDownloads: 2

# Proxy settings (optional - leave empty if not using)
proxies: []

# ================================
# Creators to download
# ================================
creators:
  # Patreon creator
  - service: patreon
    userId: "30037948"
  
  # Fanbox creator
  - service: fanbox
    userId: "3316400"
  
  # Fantia creator with custom folder
  - service: fantia
    userId: "83679"
    outputDir: fantia/%username%
    maxPosts: 100
  
  # OnlyFans creator (needs Coomer)
  - service: onlyfans
    userId: "belledelphine"
    host: coomer.st
  
  # Fansly creator (needs Coomer)
  - service: fansly
    userId: "someuser"
    host: coomer.st
```

## Tips for Config Files

### Use Quotes for IDs

Always put user IDs in quotes, especially if they're just numbers:

```yaml
# Good
userId: "12345678"

# Can cause problems
userId: 12345678
```

### Organize by Platform

Group similar creators together for easier management:

```yaml
creators:
  # === KEMONO (Patreon, Fanbox, etc.) ===
  - service: patreon
    userId: "user1"
  - service: patreon
    userId: "user2"
  
  # === COOMER (OnlyFans, Fansly) ===
  - service: onlyfans
    userId: "user3"
    host: coomer.st
```

### Comment Out Creators

To temporarily skip a creator, add `#` at the start:

```yaml
creators:
  - service: patreon
    userId: "active-creator"
  
  # - service: patreon
  #   userId: "skip-this-one"
```

## Running Your Config

Once your config is set up:

```bash
# Run with config file
./kemono-scraper -c config.yaml
```

The scraper will:
1. Process each creator one by one
2. Show progress for each creator
3. Wait a few seconds between creators (to avoid rate limits)
4. Show a summary when done

## Troubleshooting

### "Config file not found"

Make sure the file exists and you're pointing to the right path:
```bash
./kemono-scraper -c ./config.yaml
```

### "creators array required"

Your config file needs at least one creator:
```yaml
creators:
  - service: patreon
    userId: "12345678"
```

### YAML Syntax Errors

- Check your indentation (use spaces, not tabs)
- Make sure strings with special characters are in quotes
- Use an online YAML validator if needed

## Next Steps

- Learn about [proxy setup](/Kemono-Scraper/usage/proxy/) for better reliability
- See all [command line options](/Kemono-Scraper/usage/cli-options/)
