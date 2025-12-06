import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

type AnyAgent = import('node:http').Agent;

export type ProxyType = 'http' | 'https' | 'socks5';
export type ProxyRotation = 'round_robin';

export interface ProxyConfig {
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface ProxySelection {
  id: string;
  label: string;
  httpAgent: AnyAgent;
  httpsAgent: AnyAgent;
}

interface ProxyEntry extends ProxySelection {
  cooldownUntil: number;
  consecutiveFailures: number;
}

interface ProxyManagerOptions {
  cooldownMs?: number;
}

const DEFAULT_COOLDOWN_MS = 30_000;

function buildAuth(config: ProxyConfig): string {
  if (!config.username) {
    return '';
  }
  const user = encodeURIComponent(config.username);
  const pass = config.password ? `:${encodeURIComponent(config.password)}` : '';
  return `${user}${pass}@`;
}

function buildProxyUrl(config: ProxyConfig): string {
  const auth = buildAuth(config);
  return `${config.type}://${auth}${config.host}:${config.port}`;
}

function createAgents(config: ProxyConfig): { httpAgent: AnyAgent; httpsAgent: AnyAgent } {
  const proxyUrl = buildProxyUrl(config);
  switch (config.type) {
    case 'http':
      return {
        httpAgent: new HttpProxyAgent(proxyUrl),
        httpsAgent: new HttpsProxyAgent(proxyUrl),
      };
    case 'https':
      return {
        httpAgent: new HttpProxyAgent(proxyUrl),
        httpsAgent: new HttpsProxyAgent(proxyUrl),
      };
    case 'socks5':
      const socksAgent = new SocksProxyAgent(proxyUrl);
      return {
        httpAgent: socksAgent,
        httpsAgent: socksAgent,
      };
    default:
      const exhaustiveCheck: never = config.type;
      throw new Error(`Unsupported proxy type: ${exhaustiveCheck}`);
  }
}

export class ProxyManager {
  private entries: ProxyEntry[];
  private rotation: ProxyRotation;
  private currentIndex: number;
  private cooldownMs: number;

  constructor(proxies: ProxyConfig[], rotation: ProxyRotation = 'round_robin', options: ProxyManagerOptions = {}) {
    this.rotation = rotation;
    this.currentIndex = 0;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.entries = proxies.map((proxy, index) => {
      const { httpAgent, httpsAgent } = createAgents(proxy);
      const label = `${proxy.type}://${proxy.host}:${proxy.port}`;
      return {
        id: `proxy-${index}`,
        label,
        httpAgent,
        httpsAgent,
        cooldownUntil: 0,
        consecutiveFailures: 0,
      };
    });
  }

  get size(): number {
    return this.entries.length;
  }

  hasAvailableProxy(now = Date.now()): boolean {
    return this.entries.some((entry) => entry.cooldownUntil <= now);
  }

  getAvailability(now = Date.now()): { total: number; available: number } {
    const available = this.entries.filter((entry) => entry.cooldownUntil <= now).length;
    return { total: this.entries.length, available };
  }

  getNextProxy(targetUrl: string): ProxySelection | null {
    if (this.entries.length === 0) {
      return null;
    }

    const now = Date.now();
    const attempts = this.entries.length;

    for (let i = 0; i < attempts; i++) {
      const index = (this.currentIndex + i) % this.entries.length;
      const candidate = this.entries[index];

      if (candidate.cooldownUntil > now) {
        continue;
      }

      // Round-robin: move pointer past chosen entry
      this.currentIndex = (index + 1) % this.entries.length;

      // Return cached agents (axios will pick httpAgent/httpsAgent based on URL protocol)
      return {
        id: candidate.id,
        label: candidate.label,
        httpAgent: candidate.httpAgent,
        httpsAgent: candidate.httpsAgent,
      };
    }

    return null;
  }

  reportFailure(proxyId: string): void {
    const entry = this.entries.find((p) => p.id === proxyId);
    if (!entry) return;
    entry.consecutiveFailures += 1;
    entry.cooldownUntil = Date.now() + this.cooldownMs;
  }

  reportSuccess(proxyId: string): void {
    const entry = this.entries.find((p) => p.id === proxyId);
    if (!entry) return;
    entry.consecutiveFailures = 0;
    entry.cooldownUntil = 0;
  }
}
