#!/usr/bin/env node
import { spawn } from 'child_process';
import { platform } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWindows = platform() === 'win32';

const script = isWindows ? 'compress.ps1' : 'compress.sh';
const scriptPath = join(__dirname, script);

console.log(`Running ${script} for ${platform()}...`);
console.log('');

const child = isWindows
  ? spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      stdio: 'inherit',
      cwd: __dirname,
    })
  : spawn('bash', [scriptPath], {
      stdio: 'inherit',
      cwd: __dirname,
    });

child.on('close', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error(`Failed to start ${script}:`, err.message);
  process.exit(1);
});
