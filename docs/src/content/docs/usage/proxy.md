---
title: Proxy Setup
description: Configure proxies for better reliability and to avoid rate limits
sidebar:
  order: 4
---

If you're experiencing connection issues or want to improve download reliability, you can configure the scraper to use proxies.

## When to Use Proxies

You might want to use proxies if:

- You're getting rate limited (downloads fail frequently)
- Your IP is blocked by Kemono/Coomer
- You want to distribute requests across multiple IPs
- You need to route traffic through a specific location

:::note
Most users don't need proxies! Try without them first.
:::

## Configuring Proxies

Proxies are configured in your `config.yaml` file.

### Basic Proxy Setup

```yaml
# Proxy configuration
proxies:
  - type: http
    host: proxy.example.com
    port: 8080

# Your creators
creators:
  - service: patreon
    userId: "12345678"
```

### Proxy with Authentication

If your proxy requires a username and password:

```yaml
proxies:
  - type: http
    host: proxy.example.com
    port: 8080
    username: your-username
    password: your-password
```

### Multiple Proxies

The scraper will rotate between proxies automatically:

```yaml
proxies:
  - type: http
    host: proxy1.example.com
    port: 8080
  
  - type: http
    host: proxy2.example.com
    port: 8080
  
  - type: socks5
    host: socks.example.com
    port: 1080
```

## Proxy Types

| Type | Description | Example |
|------|-------------|---------|
| `http` | Standard HTTP proxy | Most common |
| `https` | HTTPS proxy | For encrypted proxy connections |
| `socks5` | SOCKS5 proxy | More versatile, supports all traffic |

### HTTP Proxy Example

```yaml
proxies:
  - type: http
    host: 192.168.1.100
    port: 3128
```

### SOCKS5 Proxy Example

```yaml
proxies:
  - type: socks5
    host: socks.example.com
    port: 1080
    username: user
    password: pass
```

## Proxy Rotation

When you have multiple proxies, the scraper automatically:

1. **Rotates** between proxies (round-robin)
2. **Detects** unhealthy proxies
3. **Cools down** failed proxies temporarily
4. **Falls back** to direct connection if all proxies fail

### Rotation Mode

```yaml
proxyRotation: round_robin  # Default
```

## Debugging Proxy Issues

Enable verbose proxy logging to see what's happening:

```bash
DEBUG_PROXY=1 ./kemono-scraper -c config.yaml
```

This shows:
- Which proxy is being used for each request
- Proxy failures and cooldowns
- Fallback to direct connections

## Complete Example

Here's a full config with proxies:

```yaml
# Kemono Scraper Configuration with Proxies

host: kemono.cr
outputDir: downloads-%username%
maxPosts: 5000

# Proxy configuration
proxyRotation: round_robin
proxies:
  # Fast HTTP proxy
  - type: http
    host: fast-proxy.example.com
    port: 8080
  
  # Backup SOCKS5 proxy
  - type: socks5
    host: backup.example.com
    port: 1080
    username: myuser
    password: mypass

# Creators to download
creators:
  - service: patreon
    userId: "12345678"
  
  - service: onlyfans
    userId: "someuser"
    host: coomer.st
```

## Common Proxy Issues

### "Proxy connection refused"

- Check that the proxy host and port are correct
- Make sure the proxy is running and accessible
- Verify any firewall rules allow the connection

### "Proxy authentication required"

Add username and password to your proxy config:

```yaml
proxies:
  - type: http
    host: proxy.example.com
    port: 8080
    username: your-username
    password: your-password
```

### "All proxies failing"

- The scraper will fall back to direct connections
- Check your proxy credentials and connectivity
- Try reducing concurrent downloads: `maxConcurrentDownloads: 1`

### Proxy is slow

- Try a different proxy provider
- Use a proxy closer to your location
- Consider using fewer concurrent downloads

## Where to Get Proxies

There are many proxy providers available. Some options:

- **Residential proxies** - Look like regular home connections
- **Datacenter proxies** - Faster but may be blocked more often
- **Free proxies** - Not recommended (unreliable and insecure)

:::caution
Always use trusted proxy providers. Free proxies can intercept your traffic!
:::

## Running Without Proxies

To disable proxies, either:

1. Remove the `proxies` section from your config
2. Leave it empty:

```yaml
proxies: []
```

The scraper works fine without proxies for most users.
