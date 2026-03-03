import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import chalk from 'chalk';
import { execFileSync, spawnSync } from 'node:child_process';

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

// --- TUI Editor ---

interface EditorProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

function Editor({ onSubmit, onCancel }: EditorProps) {
  const [text, setText] = useState('');
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.ctrl && input === 'd') {
      const trimmed = text.trim();
      if (trimmed) {
        onSubmit(trimmed);
        exit();
      }
    } else if (key.ctrl && input === 'c') {
      onCancel();
      exit();
    } else if (key.return) {
      setText(t => t + '\n');
    } else if (key.backspace || key.delete) {
      setText(t => t.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta) {
      setText(t => t + input);
    }
  });

  // Append a trailing space so the last line always shows a cursor slot
  const lines = (text + ' ').split('\n');
  const lastIdx = lines.length - 1;
  const hasContent = text.trim().length > 0;

  return (
    <Box flexDirection="column" marginY={1}>
      <Box marginBottom={1} gap={2}>
        <Text bold color="cyan">
          cm
        </Text>
        <Text color="white">what should claude do?</Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={hasContent ? 'cyan' : 'gray'}
        paddingX={1}
        minWidth={60}
      >
        {lines.map((line, i) =>
          i === lastIdx ? (
            <Text key={i}>
              {line.slice(0, -1)}
              <Text inverse> </Text>
            </Text>
          ) : (
            <Text key={i}>{line}</Text>
          ),
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>  ctrl+d to submit  ·  ctrl+c to cancel</Text>
      </Box>
    </Box>
  );
}

// --- Main ---

async function main(): Promise<void> {
  checkGitClean();

  let promptText: string | null = null;
  let cancelled = false;

  const { waitUntilExit } = render(
    React.createElement(Editor, {
      onSubmit: (text: string) => {
        promptText = text;
      },
      onCancel: () => {
        cancelled = true;
      },
    }),
  );

  await waitUntilExit();

  if (cancelled || !promptText) {
    console.log(chalk.dim('\n  Cancelled.'));
    process.exit(0);
  }

  // Create an empty git commit stamping the prompt into history
  console.log('\n' + chalk.cyan('◆') + ' Creating commit…');
  try {
    execFileSync('git', ['commit', '--allow-empty', '-m', promptText], {
      stdio: 'inherit',
    });
  } catch {
    console.error(chalk.red.bold('\n  ✗ Failed to create git commit'));
    process.exit(1);
  }

  // Hand off to claude inside the devcontainer
  console.log('\n' + chalk.cyan('◆') + ' Starting claude…\n');
  const result = spawnSync(
    'devcontainer',
    ['exec', 'claude', '--dangerously-skip-permissions', promptText],
    { stdio: 'inherit' },
  );

  process.exit(result.status ?? 0);
}

main().catch((err: Error) => {
  console.error(chalk.red.bold('Error:'), err.message);
  process.exit(1);
});
