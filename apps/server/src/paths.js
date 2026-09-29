import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export function dataDir() {
  const dir =
    process.env.DSS_DATA_DIR ||
    (process.platform === 'win32'
      ? path.join(process.env.APPDATA || os.homedir(), 'discord-status-studio-server')
      : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'discord-status-studio'));
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export const files = {
  data: () => path.join(dataDir(), 'data.json'),
  auth: () => path.join(dataDir(), 'auth.json'),
  cliToken: () => path.join(dataDir(), 'cli.token'),
  pid: () => path.join(dataDir(), 'server.pid'),
  log: () => path.join(dataDir(), 'server.log'),
  runtime: () => path.join(dataDir(), 'runtime.json'),
  media: () => {
    const d = path.join(dataDir(), 'media');
    fs.mkdirSync(d, { recursive: true });
    return d;
  },
};
