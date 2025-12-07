import { spawn } from 'child_process';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

export interface CompressOptions {
  jpegXlQuality?: number;
  jpegXlEffort?: number;
  av1Crf?: number;
  av1Preset?: number;
  keepOriginals?: boolean;
  dryRun?: boolean;
  cwd?: string;
}

export interface CompressionStats {
  convertedImages: number;
  skippedImages: number;
  convertedVideos: number;
  skippedVideos: number;
  errors: number;
  totalImages: number;
  totalVideos: number;
}

interface CompressionConfig {
  jpegXlQuality: number;
  jpegXlEffort: number;
  av1Crf: number;
  av1Preset: number;
  keepOriginals: boolean;
  dryRun: boolean;
  cwd: string;
}

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export async function runCompression(options: CompressOptions = {}): Promise<CompressionStats> {
  const config = resolveConfig(options);
  const tools = assertToolsAvailable(config.cwd);

  const downloadDirs = await findDownloadDirs(config.cwd);
  if (downloadDirs.length === 0) {
    console.log(chalk.yellow('No downloads-* directories found. Nothing to compress.'));
    return emptyStats();
  }

  const stats: CompressionStats = emptyStats();
  console.log(chalk.cyan('============================================'));
  console.log(chalk.cyan('  Media Compression  '));
  console.log(chalk.cyan('============================================'));
  console.log(`JPEG XL Quality: ${config.jpegXlQuality}, Effort: ${config.jpegXlEffort}`);
  console.log(`AV1 CRF: ${config.av1Crf}, Preset: ${config.av1Preset}`);
  console.log(`Keep originals: ${config.keepOriginals ? 'yes' : 'no'}`);
  if (config.dryRun) {
    console.log('Dry run: enabled (no files will be modified)');
  }
  console.log(chalk.cyan('============================================'));
  console.log('');

  const imageFiles = await collectFiles(downloadDirs, ['.jpg', '.jpeg']);
  stats.totalImages = imageFiles.length;
  if (imageFiles.length === 0) {
    console.log(chalk.gray('No JPEG images found.'));
  } else {
    console.log(chalk.blue(`[INFO] Found ${imageFiles.length} JPEG image(s)`));
    for (const element of imageFiles) {
      const file = element;
      const success = await compressImage(file, config, tools, stats);
      if (!success) {
        stats.errors += 1;
      }
    }
  }

  console.log('');

  const videoFiles = await collectFiles(downloadDirs, ['.mp4', '.mkv']);
  stats.totalVideos = videoFiles.length;
  if (videoFiles.length === 0) {
    console.log(chalk.gray('No MP4/MKV videos found.'));
  } else {
    console.log(chalk.blue(`[INFO] Found ${videoFiles.length} video(s)`));
    for (const file of videoFiles) {
      const success = await compressVideo(file, config, tools, stats);
      if (!success) {
        stats.errors += 1;
      }
    }
  }

  console.log('');
  console.log(chalk.cyan('============================================'));
  console.log(chalk.cyan('  Compression Complete'));
  console.log(chalk.cyan('============================================'));
  console.log(`Images converted: ${stats.convertedImages}`);
  console.log(`Images skipped: ${stats.skippedImages}`);
  console.log(`Videos converted: ${stats.convertedVideos}`);
  console.log(`Videos skipped: ${stats.skippedVideos}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(chalk.cyan('============================================'));

  return stats;
}

function resolveConfig(options: CompressOptions): CompressionConfig {
  const cwd = options.cwd || process.cwd();
  const jpegXlQuality = getNumber(options.jpegXlQuality, process.env.JPEG_XL_QUALITY, 90);
  const jpegXlEffort = getNumber(options.jpegXlEffort, process.env.JPEG_XL_EFFORT, 5);
  const av1Crf = getNumber(options.av1Crf, process.env.AV1_CRF, 30);
  const av1Preset = getNumber(options.av1Preset, process.env.AV1_PRESET, 6);
  const keepOriginals = getBoolean(options.keepOriginals, process.env.KEEP_ORIGINALS, true);
  const dryRun = options.dryRun ?? false;

  return {
    jpegXlQuality,
    jpegXlEffort,
    av1Crf,
    av1Preset,
    keepOriginals,
    dryRun,
    cwd,
  };
}

function getNumber(value: number | undefined, envValue: string | undefined, fallback: number): number {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (envValue) {
    const parsed = Number(envValue);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function getBoolean(value: boolean | undefined, envValue: string | undefined, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof envValue === 'string') {
    const lowered = envValue.toLowerCase();
    if (lowered === '0' || lowered === 'false' || lowered === 'no') {
      return false;
    }
    if (lowered === '1' || lowered === 'true' || lowered === 'yes') {
      return true;
    }
  }
  return fallback;
}

function emptyStats(): CompressionStats {
  return {
    convertedImages: 0,
    skippedImages: 0,
    convertedVideos: 0,
    skippedVideos: 0,
    errors: 0,
    totalImages: 0,
    totalVideos: 0,
  };
}

async function findDownloadDirs(cwd: string): Promise<string[]> {
  const entries = await fs.readdir(cwd, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('downloads-'))
    .map((entry) => path.join(cwd, entry.name));
}

async function collectFiles(dirs: string[], extensions: string[]): Promise<string[]> {
  const results: string[] = [];
  for (const dir of dirs) {
    await walk(dir, (filePath) => {
      if (extensions.includes(path.extname(filePath).toLowerCase())) {
        results.push(filePath);
      }
    });
  }
  return results;
}

async function walk(dir: string, onFile: (filePath: string) => void): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, onFile);
    } else if (entry.isFile()) {
      onFile(fullPath);
    }
  }
}

function assertToolsAvailable(cwd: string): { cjxl: string; ffmpeg: string; ffprobe: string } {
  const cjxl = resolveExecutable('cjxl', cwd);
  const ffmpeg = resolveExecutable('ffmpeg', cwd);
  const ffprobe = resolveExecutable('ffprobe', cwd);

  const missing: string[] = [];
  if (!cjxl) missing.push('cjxl');
  if (!ffmpeg) missing.push('ffmpeg');
  if (!ffprobe) missing.push('ffprobe');

  if (missing.length > 0) {
    throw new Error(`Missing required tools: ${missing.join(', ')}. Please install them and ensure they are on your PATH.`);
  }

  return {
    cjxl: cjxl!,
    ffmpeg: ffmpeg!,
    ffprobe: ffprobe!,
  };
}

function resolveExecutable(command: string, cwd: string): string | null {
  const envPath = process.env.PATH || '';
  const pathExt = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  const segments = envPath.split(path.delimiter);

  for (const segment of segments) {
    const candidateDir = segment === '' ? cwd : segment;
    for (const ext of pathExt) {
      const candidate = path.join(candidateDir, command + ext.toLowerCase());
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }

  return null;
}

async function compressImage(
  src: string,
  config: CompressionConfig,
  tools: { cjxl: string },
  stats: CompressionStats,
): Promise<boolean> {
  const dst = replaceExt(src, '.jxl');
  if (await fs.pathExists(dst)) {
    console.log(chalk.yellow(`[SKIP] JXL already exists: ${dst}`));
    stats.skippedImages += 1;
    return true;
  }

  const srcStat = await fs.stat(src);
  if (srcStat.size > 50 * 1024 * 1024) {
    console.log(chalk.yellow(`[SKIP] Skipping large file (>50MB): ${src}`));
    stats.skippedImages += 1;
    return true;
  }
  if (srcStat.size < 1000) {
    console.log(chalk.yellow(`[SKIP] Skipping suspiciously small file: ${src}`));
    stats.skippedImages += 1;
    return true;
  }

  if (config.dryRun) {
    console.log(chalk.blue(`[DRY RUN] Would convert image: ${src}`));
    stats.skippedImages += 1;
    return true;
  }

  console.log(chalk.blue(`[INFO] Converting image: ${src}`));
  const result = await spawnCommand(tools.cjxl, [src, dst, '-j', '0', '-q', String(config.jpegXlQuality), '-e', String(config.jpegXlEffort)]);

  if (result.code !== 0 || !(await fs.pathExists(dst))) {
    console.log(chalk.red(`[ERROR] cjxl failed (${result.code ?? 'unknown code'}): ${src}`));
    if (result.stderr.trim()) {
      console.log(chalk.red(result.stderr.trim()));
    }
    await fs.remove(dst).catch(() => {});
    return false;
  }

  const dstStat = await fs.stat(dst);
  const savings = computeSavings(srcStat.size, dstStat.size);
  await fs.utimes(dst, srcStat.atime, srcStat.mtime);

  if (!config.keepOriginals) {
    await fs.remove(src).catch(() => {});
  }

  console.log(chalk.green(`[OK] Converted: ${src} -> ${dst} (${savings} smaller)`));
  stats.convertedImages += 1;
  return true;
}

async function compressVideo(
  src: string,
  config: CompressionConfig,
  tools: { ffprobe: string; ffmpeg: string },
  stats: CompressionStats,
): Promise<boolean> {
  const dst = appendSuffix(src, '_av1.mp4');
  const tmp = appendSuffix(src, '_av1_tmp.mp4');

  if (await fs.pathExists(dst)) {
    console.log(chalk.yellow(`[SKIP] AV1 version already exists: ${dst}`));
    stats.skippedVideos += 1;
    return true;
  }

  const codec = await getVideoCodec(tools.ffprobe, src);
  if (codec === 'av1') {
    console.log(chalk.yellow(`[SKIP] Already AV1: ${src}`));
    stats.skippedVideos += 1;
    return true;
  }

  if (config.dryRun) {
    console.log(chalk.blue(`[DRY RUN] Would convert video: ${src}`));
    stats.skippedVideos += 1;
    return true;
  }

  console.log(chalk.blue(`[INFO] Re-encoding video: ${src}`));
  const args = [
    '-y',
    '-i',
    src,
    '-c:v',
    'libsvtav1',
    '-crf',
    String(config.av1Crf),
    '-preset',
    String(config.av1Preset),
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    tmp,
  ];

  const result = await spawnCommand(tools.ffmpeg, args);
  if (result.code !== 0 || !(await fs.pathExists(tmp))) {
    console.log(chalk.red(`[ERROR] ffmpeg failed (${result.code ?? 'unknown code'}): ${src}`));
    if (result.stderr.trim()) {
      console.log(chalk.red(result.stderr.trim()));
    }
    await fs.remove(tmp).catch(() => {});
    return false;
  }

  const srcStat = await fs.stat(src);
  const tmpStat = await fs.stat(tmp);
  const savings = computeSavings(srcStat.size, tmpStat.size);

  // Only keep if not significantly larger than original
  if (tmpStat.size >= srcStat.size * 1.1) {
    await fs.remove(tmp).catch(() => {});
    console.log(chalk.yellow(`[SKIP] AV1 version larger, keeping original: ${src}`));
    stats.skippedVideos += 1;
    return true;
  }

  await fs.utimes(tmp, srcStat.atime, srcStat.mtime);
  await fs.move(tmp, dst, { overwrite: true });
  if (!config.keepOriginals) {
    await fs.remove(src).catch(() => {});
  }

  console.log(chalk.green(`[OK] Converted: ${src} -> ${dst} (${savings} smaller)`));
  stats.convertedVideos += 1;
  return true;
}

function replaceExt(filePath: string, newExt: string): string {
  const ext = path.extname(filePath);
  return filePath.slice(0, -ext.length) + newExt;
}

function appendSuffix(filePath: string, suffix: string): string {
  const ext = path.extname(filePath);
  return filePath.slice(0, -ext.length) + suffix;
}

async function getVideoCodec(ffprobePath: string, filePath: string): Promise<string | null> {
  const result = await spawnCommand(ffprobePath, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=codec_name',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  if (result.code !== 0) {
    return null;
  }
  return result.stdout.trim().toLowerCase() || null;
}

function computeSavings(srcSize: number, dstSize: number): string {
  if (srcSize === 0 || dstSize === 0) {
    return 'n/a';
  }
  const pct = 100 - Math.round((dstSize * 100) / srcSize);
  return `${pct}%`;
}

function spawnCommand(command: string, args: string[]): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', () => {
      resolve({ code: 1, stdout, stderr: 'Failed to spawn process' });
    });
  });
}
