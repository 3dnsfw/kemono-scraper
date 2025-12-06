import { expect, test } from 'bun:test';
import { ProxyConfig, ProxyManager } from './proxyManager.js';

const sampleProxies: ProxyConfig[] = [
  { type: 'http', host: 'proxy-one', port: 8080 },
  { type: 'socks5', host: 'proxy-two', port: 1080 },
];

test('round-robin rotates through proxies', () => {
  const manager = new ProxyManager(sampleProxies, 'round_robin', { cooldownMs: 10_000 });

  const first = manager.getNextProxy('https://example.com');
  const second = manager.getNextProxy('https://example.com');
  const third = manager.getNextProxy('https://example.com');

  expect(first?.label).toBe('http://proxy-one:8080');
  expect(second?.label).toBe('socks5://proxy-two:1080');
  expect(third?.label).toBe('http://proxy-one:8080');
});

test('failed proxy is cooled down and skipped', () => {
  const manager = new ProxyManager(sampleProxies, 'round_robin', { cooldownMs: 60_000 });
  const first = manager.getNextProxy('https://example.com');
  expect(first).toBeDefined();
  if (first) {
    manager.reportFailure(first.id);
  }

  const next = manager.getNextProxy('https://example.com');
  expect(next?.id).not.toBe(first?.id);
  expect(manager.hasAvailableProxy()).toBe(true);
});

test('returns null when no proxies configured', () => {
  const manager = new ProxyManager([], 'round_robin');
  expect(manager.getNextProxy('https://example.com')).toBeNull();
  expect(manager.hasAvailableProxy()).toBe(false);
});
