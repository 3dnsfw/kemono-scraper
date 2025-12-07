import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import {
  BLACKLIST_EXPIRY_MS,
  MAX_FAILURES_BEFORE_BLACKLIST,
} from './constants';
import type {
  BlacklistEntry,
  ScraperContext,
} from './types';

export async function loadBlacklist(ctx: ScraperContext): Promise<void> {
  try {
    if (await fs.pathExists(ctx.blacklistFile)) {
      const data = await fs.readJson(ctx.blacklistFile);
      if (Array.isArray(data)) {
        const now = Date.now();
        let expiredCount = 0;

        for (const entry of data as BlacklistEntry[]) {
          if (entry.filePath) {
            if (entry.addedAt) {
              const addedTime = new Date(entry.addedAt).getTime();
              if (now - addedTime > BLACKLIST_EXPIRY_MS) {
                expiredCount++;
                continue;
              }
              ctx.addedAtDates.set(entry.filePath, entry.addedAt);
            }

            ctx.blacklist.add(entry.filePath);
            if (entry.failureCount) {
              ctx.failureCounts.set(entry.filePath, entry.failureCount);
            }
            if (entry.fileName) {
              ctx.fileNames.set(entry.filePath, entry.fileName);
            }
          }
        }

        if (expiredCount > 0) {
          console.log(chalk.cyan(`Removed ${expiredCount} expired blacklist entries (older than 2 days) - will retry these downloads`));
          await saveBlacklist(ctx);
        }
        console.log(chalk.yellow(`Loaded ${ctx.blacklist.size} blacklisted items from ${ctx.blacklistFile}`));
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error loading blacklist: ${error}`));
  }
}

export async function saveBlacklist(ctx: ScraperContext): Promise<void> {
  try {
    const entries: BlacklistEntry[] = [];
    for (const filePath of ctx.blacklist) {
      const failureCount = ctx.failureCounts.get(filePath) || MAX_FAILURES_BEFORE_BLACKLIST;
      const fileName = ctx.fileNames.get(filePath) || path.basename(filePath);
      const addedAt = ctx.addedAtDates.get(filePath) || new Date().toISOString();
      entries.push({
        filePath,
        fileName,
        addedAt,
        failureCount,
      });
    }
    await fs.writeJson(ctx.blacklistFile, entries, { spaces: 2 });
  } catch (error) {
    console.error(chalk.red(`Error saving blacklist: ${error}`));
  }
}

export async function addToBlacklist(ctx: ScraperContext, filePath: string, fileName: string): Promise<void> {
  if (!ctx.blacklist.has(filePath)) {
    ctx.blacklist.add(filePath);
    ctx.failureCounts.set(filePath, MAX_FAILURES_BEFORE_BLACKLIST);
    ctx.fileNames.set(filePath, fileName);
    ctx.addedAtDates.set(filePath, new Date().toISOString());
    await saveBlacklist(ctx);
    console.log(chalk.red(`Added to blacklist (5 failures): ${fileName}`));
  }
}

export async function recordFailure(ctx: ScraperContext, filePath: string, fileName: string): Promise<void> {
  const currentCount = ctx.failureCounts.get(filePath) || 0;
  const newCount = currentCount + 1;
  ctx.failureCounts.set(filePath, newCount);
  ctx.fileNames.set(filePath, fileName);

  if (newCount >= MAX_FAILURES_BEFORE_BLACKLIST) {
    await addToBlacklist(ctx, filePath, fileName);
  }
}

export function safeUpdateTask(ctx: ScraperContext, postId: string, update: any): void {
  try {
    ctx.downloadBars.updateTask(postId, update);
  } catch {
    // Task doesn't exist, ignore
  }
}

export function safeDoneTask(ctx: ScraperContext, postId: string, update: any): void {
  try {
    ctx.downloadBars.done(postId, update);
  } catch {
    // Task doesn't exist, ignore
  }
}

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[\/\\\?%*:|"<>]/g, '_');
}

export function getTempPath(filePath: string): string {
  return filePath + '.downloading';
}

export async function cleanupTempFiles(directory: string): Promise<number> {
  let cleanedCount = 0;
  try {
    const files = await fs.readdir(directory);
    for (const file of files) {
      if (file.endsWith('.downloading')) {
        try {
          await fs.remove(path.join(directory, file));
          cleanedCount++;
        } catch {
          // Ignore errors
        }
      }
    }
  } catch {
    // Directory might not exist yet, ignore
  }
  return cleanedCount;
}

export async function fileExistsOrCompressed(filePath: string): Promise<boolean> {
  if (await fs.pathExists(filePath)) {
    return true;
  }

  const ext = path.extname(filePath).toLowerCase();
  const basePath = filePath.slice(0, -ext.length);

  if (['.jpg', '.jpeg'].includes(ext)) {
    if (await fs.pathExists(basePath + '.jxl')) {
      return true;
    }
  }

  if (['.mp4', '.mkv'].includes(ext)) {
    if (await fs.pathExists(basePath + '_av1.mp4')) {
      return true;
    }
  }

  return false;
}
