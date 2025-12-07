# Kemono / Coomer Scraper

Download all media from Kemono and Coomer. Scrapes posts from a given service and user, downloading all attachments into a specified folder.

## Features

- Scrapes posts from various services (Patreon, OnlyFans, Fansly, etc.)
- Downloads attachments while checking for existing files
- Supports multiple hosts and CDN failover
- Proxy pool with round-robin rotation and cooldowns
- Progress bars with percentage and ETA
- Blacklist system for permanently failed downloads
- **Standalone executables** — no runtime required
- **Media compression** — convert images to JPEG XL and videos to AV1

## Documentation

📖 **[View the full documentation](https://3dnsfw.github.io/kemono-scraper/)**

The documentation covers:
- Installation (pre-built executables or from source)
- Quick start guide
- Configuration file for multiple creators
- All command-line options
- Proxy setup
- FAQ & troubleshooting

## Quick Start

```bash
# Download the executable for your platform from GitHub Releases
# Then run:
./kemono-scraper -s patreon -u 30037948

# Or for OnlyFans/Fansly (via Coomer):
./kemono-scraper -s onlyfans -u username --host coomer.st
```

See the [documentation](https://3dnsfw.github.io/kemono-scraper/) for detailed instructions.

## License

MIT
