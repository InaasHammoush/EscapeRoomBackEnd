import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const testFiles = [
  'testSouthWallFlow.js',
  'testWestWallFlow.js',
  'testNorthWall.js',
  'testLightBeamGrid.js',
  'testEastWallFlow.js', // <-- neu
];

function runTest(file) {
  return new Promise((resolvePromise) => {
    const absPath = resolve(__dirname, file);

    console.log(`\n==================================================`);
    console.log(`▶ Running: ${file}`);
    console.log(`==================================================`);

    const child = spawn(process.execPath, [absPath], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code, signal) => {
      resolvePromise({
        file,
        ok: code === 0,
        code: code ?? 1,
        signal: signal ?? null,
      });
    });

    child.on('error', (err) => {
      resolvePromise({
        file,
        ok: false,
        code: 1,
        signal: null,
        error: err,
      });
    });
  });
}

async function main() {
  const results = [];

  for (const file of testFiles) {
    // bewusst sequentiell: Logs bleiben sauber und gut lesbar
    // (parallel wäre möglich, aber unübersichtlicher)
    // eslint-disable-next-line no-await-in-loop
    const result = await runTest(file);
    results.push(result);
  }

  console.log(`\n\n==================== SUMMARY ====================`);
  let failed = 0;

  for (const r of results) {
    if (r.ok) {
      console.log(`✅ ${r.file}`);
    } else {
      failed += 1;
      const extra = r.signal ? ` (signal: ${r.signal})` : ` (exit: ${r.code})`;
      console.log(`❌ ${r.file}${extra}`);
      if (r.error) console.log(`   error: ${r.error.message}`);
    }
  }

  console.log(`-------------------------------------------------`);
  console.log(`Total: ${results.length} | Passed: ${results.length - failed} | Failed: ${failed}`);
  console.log(`=================================================\n`);

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('runAll crashed:', err);
  process.exit(1);
});
