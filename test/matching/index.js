// Lets `node --test test/matching/` work: Node 24 runs a directory argument as a module, which
// resolves to this file. It imports the test files only in that case, so a plain `node --test`
// (which runs every file under test/ on its own) does not run them twice.
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry === here || entry === path.join(here, 'index.js') && process.argv.includes('--run-all')) {
  for (const f of readdirSync(here).filter((n) => n.endsWith('.test.js')).sort()) {
    await import(pathToFileURL(path.join(here, f)).href);
  }
}
