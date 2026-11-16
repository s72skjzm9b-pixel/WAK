import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpDir } from './helpers';

const ROOT = path.resolve(__dirname, '..');
const plan = () => execFileSync('bash', [path.join(ROOT, 'scripts/update-and-open.sh'), '--plan'], {
  cwd: ROOT, encoding: 'utf8', env: { ...process.env, STUDIO_DATA_DIR: tmpDir(), STUDIO_BRANCH: 'no-such-branch-for-test' },
});

describe('update-and-open', () => {
  it('works offline and asks for a rebuild whenever the source changes', () => {
    const before = plan();
    expect(before).toMatch(/Offline or GitHub unreachable|up to date|newer changes|local changes/);
    const probe = path.join(ROOT, 'src', `zz-launcher-probe-${Date.now()}.ts`);
    writeFileSync(probe, 'export {};\n');
    try {
      expect(plan()).toMatch(/PLAN: rebuild needed/);
    } finally { rmSync(probe); }
  }, 60_000);
});
