/**
 * tests/run_all_tests.js
 * Master Test Runner for AgroChem ERP
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testsDir = __dirname;
const files = fs.readdirSync(testsDir)
  .filter(f => f.startsWith('test_') && f.endsWith('.js'))
  .sort();

console.log(`🚀 Found ${files.length} test suites in ${testsDir}\n`);

let passed = 0;
let failed = 0;
const failedTests = [];

files.forEach((file, index) => {
  const filePath = path.join(testsDir, file);
  process.stdout.write(`[${index + 1}/${files.length}] Running ${file}... `);
  
  const result = spawnSync(process.execPath, [filePath], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    timeout: 30000
  });

  if (result.status === 0) {
    console.log('✓ PASS');
    passed++;
  } else {
    console.log('❌ FAIL');
    failed++;
    failedTests.push({ file, output: result.stdout + '\n' + result.stderr });
  }
});

console.log(`\n===============================================================`);
console.log(`TEST RUN RESULTS: ${passed} PASSED, ${failed} FAILED (${files.length} TOTAL)`);
console.log(`===============================================================`);

if (failed > 0) {
  console.log('\n--- Failed Test Summaries ---');
  failedTests.forEach(f => {
    console.log(`\n❌ ${f.file}:`);
    console.log(f.output.slice(-800)); // Show last 800 chars
  });
  process.exit(1);
} else {
  console.log('\n🎉 ALL TEST SUITES PASSED FLAWLESSLY!');
}
