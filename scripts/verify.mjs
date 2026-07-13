/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 * Validate the generated Alfred Workflow artifacts before packaging.
 */

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflowDirectory = resolve('workflow');
const requiredArtifactNames = ['info.plist', 'chat', 'chat-actions', 'translate', 'translate-view', 'icon.png'];
const executableArtifactNames = ['chat', 'chat-actions', 'translate', 'translate-view'];

function assertArtifactExists(artifactName) {
  const artifactPath = resolve(workflowDirectory, artifactName);
  if (!existsSync(artifactPath)) {
    throw new Error(`Missing workflow artifact: ${artifactName}`);
  }
  return artifactPath;
}

function assertExecutable(artifactPath) {
  if ((statSync(artifactPath).mode & 0o111) === 0) {
    throw new Error(`Workflow script is not executable: ${artifactPath}`);
  }
}

for (const artifactName of requiredArtifactNames) {
  assertArtifactExists(artifactName);
}

const plistPath = resolve(workflowDirectory, 'info.plist');
const plistResult = spawnSync('/usr/bin/plutil', ['-lint', plistPath], { encoding: 'utf8' });
if (plistResult.status !== 0) {
  throw new Error(`Invalid Alfred plist: ${plistResult.stderr || plistResult.stdout}`);
}

for (const executableArtifactName of executableArtifactNames) {
  assertExecutable(resolve(workflowDirectory, executableArtifactName));
}

const iconResult = spawnSync('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', resolve(workflowDirectory, 'icon.png')], {
  encoding: 'utf8'
});
if (iconResult.status !== 0 || !iconResult.stdout.includes('pixelWidth: 512') || !iconResult.stdout.includes('pixelHeight: 512')) {
  throw new Error('Workflow icon must be a 512 x 512 PNG.');
}

console.log('Workflow verification passed.');
