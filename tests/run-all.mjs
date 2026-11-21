// Runs every automated check. Usage: npm test   (Node >= 22; Playwright+Chromium must be installed for browser tests)
import { spawnSync } from 'node:child_process';
const run = (args) => spawnSync(process.execPath, args, { stdio: 'inherit' }).status;
let bad = 0;
bad += run(['tools/build-config.mjs', '--check']) ? 1 : 0;
bad += run(['--import', './tests/stub/register.mjs', 'tests/backend.test.mjs']) ? 1 : 0;
bad += run(['--import', './tests/stub/register.mjs', 'tests/browser.test.mjs']) ? 1 : 0;
bad += run(['--import', './tests/stub/register.mjs', 'tests/smoke-selftest.mjs']) ? 1 : 0;
bad += run(['--import', './tests/stub/register.mjs', 'tests/community.test.mjs']) ? 1 : 0;
process.exit(bad ? 1 : 0);
