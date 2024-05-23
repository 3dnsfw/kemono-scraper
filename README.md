# Kemono / Coomer Scraper

This project downloads all images from the API. It scrapes posts from a given service and user, and downloads all attachments into a specified folder.

## Features

- Scrapes posts from various services
- Downloads attachments while checking for existing files
- Supports multiple hosts and CDN hosts
- Displays a progress bar with percentage and ETA

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
- `--host, -h`: The host to scrape from (choices: `kemono.su`, `coomer.su`, or custom) (default: `kemono.su`)
- `--cdnHost, -c`: The CDN host for downloading files (choices: `c1.kemono.su`, `c6.coomer.su`, or custom) (default: `c1.kemono.su`)

### Example

```sh
pnpm start -s patreon -u 30037948
```

#### Custom Hosts

You can also specify custom hosts:

```sh
pnpm start -s onlyfans -u belledelphine --host coomer.su --cdnHost c6.coomer.su
```
