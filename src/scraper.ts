import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { downloadAllWithRetries } from './download';
import { cleanupTempFiles, loadBlacklist, sanitizeFileName, saveBlacklist } from './files';
import { fetchPosts } from './posts';
import { PAGE_SIZE } from './constants';
import type { DownloadQueueEntry, File, Post, ScraperContext } from './types';

export async function scrapeCreator(ctx: ScraperContext): Promise<void> {
  let offset = 0;
  let hasMorePosts = true;
  const posts: Post[] = [];

  await fs.ensureDir(ctx.outputDir);

  const cleanedTempFiles = await cleanupTempFiles(ctx.outputDir);
  if (cleanedTempFiles > 0) {
    console.log(chalk.yellow(`Cleaned up ${cleanedTempFiles} incomplete download(s) from previous run`));
  }

  await loadBlacklist(ctx);

  console.log(chalk.cyan(`Starting to fetch posts for ${ctx.service}/${ctx.userId}...`));

  const seenPostIds = new Set<string>();

  while (hasMorePosts) {
    try {
      const result = await fetchPosts(ctx, offset);
      const fetchedPosts = result.posts;

      if (!fetchedPosts || fetchedPosts.length === 0) {
        hasMorePosts = false;
        break;
      }

      let newPosts = 0;
      for (const post of fetchedPosts) {
        if (!seenPostIds.has(post.id)) {
          seenPostIds.add(post.id);
          posts.push(post);
          newPosts++;
        }
      }

      if (newPosts === 0) {
        console.log(chalk.yellow(`No new posts found at offset ${offset}, reached end`));
        hasMorePosts = false;
        break;
      }

      const duplicateRatio = (fetchedPosts.length - newPosts) / fetchedPosts.length;
      if (duplicateRatio > 0.9 && posts.length > 100) {
        console.log(chalk.yellow(`High duplicate ratio (${(duplicateRatio * 100).toFixed(1)}%), likely reached end`));
        hasMorePosts = false;
        break;
      }

      console.log(chalk.cyan(`Total posts so far: ${posts.length} (${newPosts} new, ${fetchedPosts.length - newPosts} duplicates)`));

      if (fetchedPosts.length < PAGE_SIZE) {
        console.log(chalk.yellow(`Got fewer than ${PAGE_SIZE} posts, reached end`));
        hasMorePosts = false;
        break;
      }

      const maxPostsLimit = ctx.maxPosts > 0 ? ctx.maxPosts : 5000;
      if (posts.length >= maxPostsLimit) {
        console.log(chalk.yellow(`Reached limit of ${maxPostsLimit} posts, stopping`));
        hasMorePosts = false;
        break;
      }

      if (offset >= 10000) {
        console.log(chalk.yellow(`Reached maximum offset of 10000, stopping`));
        hasMorePosts = false;
        break;
      }

      offset += PAGE_SIZE;
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(chalk.red(`Failed to fetch posts at offset ${offset}:`), error);
      hasMorePosts = false;
      break;
    }
  }

  console.log(chalk.yellow(`Loaded ${posts.length} posts.`));

  const downloadQueue: DownloadQueueEntry[] = [];
  let taskCounter = 0;
  for (const post of posts) {
    const postFiles: File[] = post.attachments.slice();
    if (post.file?.path && !postFiles.some(att => att.path === post.file.path)) {
      postFiles.push(post.file);
    }

    for (const file of postFiles) {
      if (ctx.blacklist.has(file.path)) {
        continue;
      }

      const sanitizedFileName = sanitizeFileName(file.name);
      const filePath = path.join(ctx.outputDir, sanitizedFileName);
      downloadQueue.push({
        filePath: file.path,
        fileName: file.name,
        outputPath: filePath,
        postId: post.id,
        taskId: `dl-${++taskCounter}`,
      });
    }
  }

  ctx.downloadBars.addTask(ctx.overallProgressBarId, {
    type: 'percentage',
    barTransformFn: chalk.yellow,
    message: 'Starting downloads...',
  });
  const downloadResult = await downloadAllWithRetries(ctx, downloadQueue);

  if (downloadResult.failed === 0) {
    ctx.downloadBars.done(ctx.overallProgressBarId, {
      message: 'All files downloaded.',
      barTransformFn: chalk.green,
    });
  } else {
    ctx.downloadBars.done(ctx.overallProgressBarId, {
      message: `${downloadResult.completed}/${downloadResult.total} files downloaded. ${downloadResult.failed} failed (blacklisted).`,
      barTransformFn: chalk.yellow,
    });
  }

  await saveBlacklist(ctx);

  const lastUpdatedPath = path.join(ctx.outputDir, 'lastupdated.txt');
  const now = new Date();
  const humanReadableDate = now.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
  await fs.writeFile(lastUpdatedPath, humanReadableDate, 'utf8');
  console.log(chalk.green(`Last updated timestamp saved: ${humanReadableDate}`));

  if (ctx.blacklist.size > 0) {
    console.log(chalk.yellow(`\nBlacklist: ${ctx.blacklist.size} item(s) are blacklisted and will be skipped in future runs.`));
  }
}
