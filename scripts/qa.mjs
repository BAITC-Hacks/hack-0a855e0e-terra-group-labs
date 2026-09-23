import { spawnSync } from 'node:child_process'

for (const [name, command, args] of [
  ['Pipeline', 'uv', ['run', '--project', 'backend', 'pipeline']],
  ['Output validator', 'uv', ['run', '--project', 'backend', 'validate-outputs']],
  ['Backend tests', 'uv', ['run', '--project', 'backend', 'pytest', '-q']],
  ['Ruff', 'uv', ['run', '--project', 'backend', 'ruff', 'check', 'backend/src', 'tests']],
  ['Frontend unit tests', 'npm', ['run', 'test', '--prefix', 'frontend']],
  ['Frontend lint', 'npm', ['run', 'lint', '--prefix', 'frontend']],
  ['Frontend production build', 'npm', ['run', 'build', '--prefix', 'frontend']],
  ['Playwright E2E', 'npm', ['run', 'test:e2e', '--prefix', 'frontend']],
]) {
  console.log(`\n== ${name} ==`)
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) process.exit(result.status || 1)
}
console.log('\nQA CHECKS PASSED')
