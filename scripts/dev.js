// Tryb deweloperski: uruchamia jednocześnie serwer API (z automatycznym restartem po zmianie plików)
// oraz serwer Vite z odświeżaniem frontendu na żywo. Aplikacja jest dostępna pod adresem http://localhost:5173.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const processes = [
  { name: 'api ', args: ['--watch', path.join('server', 'index.js')] },
  { name: 'vite', args: [path.join('node_modules', 'vite', 'bin', 'vite.js')] },
];

let stopping = false;

const children = processes.map(({ name, args }) => {
  // FISZKI_DEV informuje serwer API, że frontend serwuje Vite (zmienia tylko komunikat startowy).
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: { ...process.env, FISZKI_DEV: '1' } });
  child.on('exit', (code) => {
    if (stopping) return;
    console.error(`[${name}] proces zakończył się (kod ${code ?? 'brak'}) — zatrzymuję pozostałe.`);
    stop(code ?? 1);
  });
  return child;
});

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(exitCode), 300);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
