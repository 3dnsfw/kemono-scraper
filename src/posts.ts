import axios, { isAxiosError } from 'axios';
import chalk from 'chalk';
import { API_HEADERS, PAGE_SIZE } from './constants';
import { buildProxyAxiosOptions, recordProxyOutcome } from './context';
import type { Post, ScraperContext } from './types';

export async function findWorkingApiHost(ctx: ScraperContext): Promise<string> {
  if (ctx.workingApiHost) {
    return ctx.workingApiHost;
  }

  console.log(chalk.yellow(`Finding working API host for ${ctx.baseDomain}...`));

  const testUrl = `https://${ctx.baseDomain}/api/v1/${ctx.service}/user/${ctx.userId}/posts?o=0`;
  console.log(chalk.gray(`Trying ${ctx.baseDomain}...`));

  let retries = 0;
  const maxRetries = 3;

  while (retries <= maxRetries) {
    const { selection, options } = buildProxyAxiosOptions(ctx, testUrl);
    try {
      const response = await axios.get(testUrl, {
        timeout: 20000,
        headers: API_HEADERS,
        ...options,
      });
      recordProxyOutcome(ctx, selection);
      if (response.status === 200 && response.data && typeof response.data === 'object') {
        if (Array.isArray(response.data.posts) || Array.isArray(response.data)) {
          ctx.workingApiHost = ctx.baseDomain;
          console.log(chalk.green(`Using API host: ${ctx.baseDomain}`));
          return ctx.baseDomain;
        }
      }
    } catch (error) {
      recordProxyOutcome(ctx, selection, error);
      if (isAxiosError(error)) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;

        if (status === 429) {
          const waitTime = Math.min(1000 * Math.pow(2, retries), 10000);
          console.log(chalk.yellow(`Rate limited (429). Waiting ${waitTime / 1000}s before retry ${retries + 1}/${maxRetries}...`));
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retries++;
          continue;
        }

        if (retries < maxRetries) {
          console.log(chalk.gray(`  ${ctx.baseDomain} failed: ${status || statusText || error.message}. Retrying...`));
          await new Promise(resolve => setTimeout(resolve, 2000 * (retries + 1)));
          retries++;
          continue;
        }

        console.log(chalk.gray(`  ${ctx.baseDomain} failed: ${status || statusText || error.message}`));
      }
      break;
    }
  }

  throw new Error(`Could not find a working API host for ${ctx.baseDomain}`);
}

export async function fetchPosts(ctx: ScraperContext, offset = 0, retries = 0): Promise<{ posts: Post[]; hasMore: boolean }> {
  const apiHost = await findWorkingApiHost(ctx);
  const url = `https://${apiHost}/api/v1/${ctx.service}/user/${ctx.userId}/posts?o=${offset}`;

  if (retries === 0) {
    console.log(chalk.blue(`Fetching posts (offset: ${offset})...`));
  }

  const { selection, options } = buildProxyAxiosOptions(ctx, url);

  try {
    const response = await axios.get(url, {
      headers: API_HEADERS,
      timeout: 30000,
      ...options,
    });
    recordProxyOutcome(ctx, selection);

    const posts = Array.isArray(response.data) ? response.data : (response.data.posts || []);
    const count = posts.length;

    if (retries === 0) {
      console.log(chalk.green(`Fetched ${count} posts (offset: ${offset})`));
    }

    const hasMore = count === PAGE_SIZE;

    return { posts, hasMore };
  } catch (error) {
    recordProxyOutcome(ctx, selection, error);
    if (isAxiosError(error)) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const message = error.message;

      console.log(chalk.red(`Error fetching posts (offset: ${offset}): ${status || statusText || message}`));

      if (status === 429 && retries < 5) {
        const waitTime = Math.min(1000 * Math.pow(2, retries), 10000);
        console.log(chalk.yellow(`Rate limited (429). Waiting ${waitTime / 1000}s before retry ${retries + 1}/5...`));
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return fetchPosts(ctx, offset, retries + 1);
      }

      if (retries < 3 && status !== 404) {
        const waitTime = 2000 * (retries + 1);
        console.log(chalk.yellow(`Retrying in ${waitTime / 1000}s... (attempt ${retries + 1}/3)`));
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return fetchPosts(ctx, offset, retries + 1);
      }

      if (status === 404) {
        console.log(chalk.yellow(`No more posts found (404)`));
        return { posts: [], hasMore: false };
      }
    }
    throw error;
  }
}
