// Build-time constants injected by scripts/build.ts via --define
// Fallback values are used during development.
declare const BUILD_VERSION: string | undefined;
declare const BUILD_COMMIT: string | undefined;
declare const BUILD_TIME: string | undefined;
declare const BUILD_TARGET: string | undefined;

export const APP_VERSION = typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : 'dev';
export const APP_COMMIT = typeof BUILD_COMMIT !== 'undefined' ? BUILD_COMMIT : 'unknown';
export const APP_BUILD_TIME = typeof BUILD_TIME !== 'undefined' ? BUILD_TIME : 'unknown';
export const APP_BUILD_TARGET = typeof BUILD_TARGET !== 'undefined' ? BUILD_TARGET : 'unknown';

export const PAGE_SIZE = 50;
export const MAX_DOWNLOAD_RETRIES = 3;
export const DOWNLOAD_RETRY_WAIT_SECONDS = 10000;
export const REQUEST_TIMEOUT_MS = 120000;
export const MAX_FAILURES_BEFORE_BLACKLIST = 5;
export const STREAM_TIMEOUT_MS = 300000;
export const BLACKLIST_EXPIRY_MS = 2 * 24 * 60 * 60 * 1000;

export const API_HEADERS = {
  'Accept': 'text/css',
  'Accept-Encoding': 'gzip, deflate',
};

export const PROXY_DEBUG = process.env.DEBUG_PROXY === '1';
export const PROXY_FAILURE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

export const MAX_RETRY_PASSES = 3;
