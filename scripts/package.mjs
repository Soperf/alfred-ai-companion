/**
 * @author xiaopeng.fxp
 * @date 2026-07-13
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = process.cwd();
const distributionDirectory = join(projectRoot, 'dist');
const archivePath = join(distributionDirectory, 'AlfredAICompanion.alfredworkflow');

mkdirSync(distributionDirectory, { recursive: true });
rmSync(archivePath, { force: true });

const result = spawnSync('/usr/bin/zip', ['-r', '-X', archivePath, 'info.plist', 'chat', 'chat-actions', 'translate', 'translate-view', 'icon.png'], {
  cwd: join(projectRoot, 'workflow'),
  encoding: 'utf8',
});
if (result.status !== 0) throw new Error(result.stderr || 'Failed to package Workflow');
