import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

const start = (script) =>
  isWindows
    ? spawn(`${npm} run ${script}`, { stdio: 'inherit', shell: true })
    : spawn(npm, ['run', script], { stdio: 'inherit', shell: false });

const processes = [start('dev:server'), start('dev:client')];

const stopAll = (code = 0) => {
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
};

for (const child of processes) {
  child.on('exit', (code) => {
    if (code && code !== 0) stopAll(code);
  });
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
