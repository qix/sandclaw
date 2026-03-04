import React from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import chalk from 'chalk';
import cac from 'cac';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { startProxy } from './proxy.js';

// --- Git status check ---

function checkGitClean(): void {
  let status: string;
  try {
    status = execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    console.error('');
    console.error(chalk.bgRed.white.bold(' cm ') + ' ' + chalk.red.bold('not a git repository'));
    console.error('');
    console.error(chalk.dim('  cm must be run from inside a git repository.'));
    console.error('');
    process.exit(1);
  }

  if (status.trim()) {
    const lines = status.trim().split('\n');

    console.error('');
    console.error(chalk.bgRed.white.bold(' cm ') + ' ' + chalk.red.bold('repository is not clean'));
    console.error('');
    console.error(
      chalk.yellow('  cm only works on clean repositories. Commit or stash your changes first.'),
    );
    console.error('');
    console.error(chalk.dim('  Uncommitted changes:'));
    console.error('');

    for (const line of lines) {
      const xy = line.slice(0, 2);
      const file = line.slice(3);
      let color: chalk.Chalk;
      if (xy.includes('M')) color = chalk.yellow;
      else if (xy.includes('A')) color = chalk.green;
      else if (xy.includes('D')) color = chalk.red;
      else if (xy.includes('?')) color = chalk.cyan;
      else color = chalk.white;

      console.error('  ' + chalk.dim(xy) + ' ' + color(file));
    }

    console.error('');
    process.exit(1);
  }
}

// --- Commit Prompt ---

interface CommitPromptProps {
  onCommit: () => void;
  onSkip: () => void;
}

function CommitPrompt({ onCommit, onSkip }: CommitPromptProps) {
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === 'y' || input === 'Y') {
      onCommit();
      exit();
    } else if (input === 'n' || input === 'N' || (key.ctrl && input === 'c')) {
      onSkip();
      exit();
    }
  });

  return (
    <Box marginY={1} gap={1}>
      <Text bold color="cyan">
        ◆
      </Text>
      <Text>Commit changes?</Text>
      <Text dimColor>(y/n)</Text>
    </Box>
  );
}

// --- Main ---

async function main(): Promise<void> {
  const cli = cac('cm');
  cli
    .option('--allow-dirty', 'Skip git clean check')
    .option('--save-logs <path>', 'Save /v1/messages request bodies to <path>/*.json');
  cli.help();
  const parsed = cli.parse();
  const allowDirty = parsed.options['allowDirty'] as boolean | undefined;
  const saveLogs = parsed.options['saveLogs'] as string | undefined;
  const extraArgs = parsed.args;

  if (parsed.options['help']) {
    process.exit(0);
  }

  if (!allowDirty) {
    checkGitClean();
  }

  // Save the current HEAD so we can diff against it later
  const commitHash = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();

  // Start the proxy to intercept API calls and collect conversation prompts
  const proxy = await startProxy({ saveLogs });
  console.log('\n' + chalk.cyan('◆') + ' Proxy started on port ' + proxy.port);

  const baseUrl = `http://127.0.0.1:${proxy.port}`;
  console.log(chalk.cyan('◆') + ` ANTHROPIC_BASE_URL=${baseUrl}`);

  // Hand off to claude — must use async spawn so the event loop stays free
  // for the proxy server to handle requests.
  console.log('\n' + chalk.cyan('◆') + ' Starting claude…\n');
  const claudeArgs = [
    `ANTHROPIC_BASE_URL=${baseUrl}`,
    'claude',
    '--dangerously-skip-permissions',
    ...extraArgs,
  ];
  const result = await new Promise<{ status: number | null }>((resolve) => {
    const child = spawn('env', claudeArgs, { stdio: 'inherit' });
    child.on('close', (code) => resolve({ status: code }));
    child.on('error', () => resolve({ status: 1 }));
  });

  proxy.close();

  // --- Post-run: diff and amend ---

  const status = execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
  });
  const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const hasUncommitted = status.trim().length > 0;
  const hasNewCommits = currentHead !== commitHash;

  if (!hasUncommitted && !hasNewCommits) {
    process.exit(result.status ?? 0);
  }

  // Show a diff of everything that changed
  console.log('\n' + chalk.cyan('◆') + ' Changes:\n');

  spawnSync('git', ['-c', 'core.pager=less -FX', 'diff', '--stat', '--color=always', commitHash], {
    stdio: 'inherit',
  });

  // List any new untracked files (not shown by git diff)
  if (hasUncommitted) {
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
      encoding: 'utf8',
    }).trim();
    if (untracked) {
      for (const file of untracked.split('\n')) {
        console.log(chalk.green(' ' + file + ' (new untracked)'));
      }
    }
  }

  console.log('');
  spawnSync('git', ['-c', 'core.pager=less -FX', 'diff', '--color=always', commitHash], {
    stdio: 'inherit',
  });

  // Ask whether to commit all changes
  let shouldCommit = false;

  const { waitUntilExit: waitCommit } = render(
    React.createElement(CommitPrompt, {
      onCommit: () => {
        shouldCommit = true;
      },
      onSkip: () => {},
    }),
  );

  await waitCommit();

  if (shouldCommit) {
    try {
      execFileSync('git', ['add', '-A']);

      // Use collected conversation prompts as the commit message
      const commitMessage =
        proxy.prompts.length > 0
          ? proxy.prompts.join('\n\n')
          : 'Claude prompt not found';

      execFileSync('git', ['commit', '-m', commitMessage], {
        stdio: 'inherit',
      });

      console.log('\n' + chalk.green('✓') + ' Changes committed.');
    } catch {
      console.error(chalk.red.bold('\n  ✗ Failed to commit'));
      process.exit(1);
    }
  }

  process.exit(result.status ?? 0);
}

main().catch((err: Error) => {
  console.error(chalk.red.bold('Error:'), err.message);
  process.exit(1);
});
