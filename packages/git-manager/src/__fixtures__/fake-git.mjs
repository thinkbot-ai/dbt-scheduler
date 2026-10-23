// Captures git argv so credential tests can assert extraHeader is passed
// without going through a real GitHub clone.
import { writeSync } from 'node:fs';

const args = process.argv.slice(2);
writeSync(1, `argv=${JSON.stringify(args)}\n`);

if (process.env.FAKE_GIT_STDERR !== undefined) {
  writeSync(2, process.env.FAKE_GIT_STDERR);
}

const exitCode = Number(process.env.FAKE_GIT_EXIT_CODE ?? '0');
process.exit(exitCode);
