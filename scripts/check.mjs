import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const config = JSON.parse(execFileSync('docker', ['buildx', 'bake', '-f', 'docker-bake.hcl', '--print'], { encoding: 'utf8' }));
const targets = Object.values(config.target);
assert.equal(targets.length, 3);
const allTags = new Set();
for (const target of targets) {
  assert.deepEqual(target.platforms, ['linux/amd64', 'linux/arm64']);
  for (const key of ['BLESTA_SHA256', 'IONCUBE_SHA256_AMD64', 'IONCUBE_SHA256_ARM64']) assert.match(target.args[key], /^[a-f0-9]{64}$/);
  for (const tag of target.tags) { assert(!allTags.has(tag), `Duplicate tag: ${tag}`); allTags.add(tag); }
  assert.equal(target.dockerfile, 'Dockerfile');
}
assert(targets.find((target) => target.args.BLESTA_VERSION === '6.0.3').tags.some((tag) => tag.endsWith(':latest')));
execFileSync('docker', ['compose', '-f', 'compose.test.yaml', 'config', '--quiet'], { stdio: 'inherit' });
execFileSync('npx', ['tsc', '--noEmit'], { stdio: 'inherit' });
console.log('Build matrix, Compose configuration, and TypeScript checks passed.');
