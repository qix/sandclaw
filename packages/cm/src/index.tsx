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
  const [cursor, setCursor] = useState(0);
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
    } else if (key.leftArrow) {
      setCursor(c => Math.max(0, c - 1));
    } else if (key.rightArrow) {
      setCursor(c => Math.min(text.length, c + 1));
    } else if (key.upArrow) {
      // Move cursor up one line
      setCursor(c => {
        const before = text.slice(0, c);
        const currentLineStart = before.lastIndexOf('\n') + 1;
        const col = c - currentLineStart;
        if (currentLineStart === 0) return 0; // already on first line, go to start
        const prevLineStart = before.lastIndexOf('\n', currentLineStart - 2) + 1;
        const prevLineLen = currentLineStart - 1 - prevLineStart;
        return prevLineStart + Math.min(col, prevLineLen);
      });
    } else if (key.downArrow) {
      // Move cursor down one line
      setCursor(c => {
        const before = text.slice(0, c);
        const currentLineStart = before.lastIndexOf('\n') + 1;
        const col = c - currentLineStart;
        const nextNewline = text.indexOf('\n', c);
        if (nextNewline === -1) return text.length; // already on last line, go to end
        const nextLineStart = nextNewline + 1;
        const nextNextNewline = text.indexOf('\n', nextLineStart);
        const nextLineLen = (nextNextNewline === -1 ? text.length : nextNextNewline) - nextLineStart;
        return nextLineStart + Math.min(col, nextLineLen);
      });
    } else if (key.return) {
      // Enter — also handle multi-char paste ending with return
      const insertion = input.length > 1 ? input.replace(/\r\n?/g, '\n') : '\n';
      setText(t => t.slice(0, cursor) + insertion + t.slice(cursor));
      setCursor(c => c + insertion.length);
    } else if (key.backspace || key.delete) {
      if (cursor > 0) {
        setText(t => t.slice(0, cursor - 1) + t.slice(cursor));
        setCursor(c => c - 1);
      }
    } else if (input && !key.ctrl && !key.meta) {
      // Regular input — normalize \r for multi-line paste support
      const insertion = input.replace(/\r\n?/g, '\n');
      setText(t => t.slice(0, cursor) + insertion + t.slice(cursor));
      setCursor(c => c + insertion.length);
    }
  });

  const lines = text.split('\n');
  const hasContent = text.trim().length > 0;

  // Find which line and column the cursor is on
  let cursorLine = 0;
  let cursorCol = 0;
  {
    let pos = 0;
    for (let i = 0; i < lines.length; i++) {
      if (cursor <= pos + lines[i].length) {
        cursorLine = i;
        cursorCol = cursor - pos;
        break;
      }
      pos += lines[i].length + 1; // +1 for \n
    }
  }

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
          i === cursorLine ? (
            <Text key={i}>
              {line.slice(0, cursorCol)}
              <Text inverse>{line[cursorCol] ?? ' '}</Text>
              {line.slice(cursorCol + 1)}
            </Text>
          ) : (
            <Text key={i}>{line || ' '}</Text>
          ),
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>  ctrl+d to submit  ·  ctrl+c to cancel</Text>
      </Box>
    </Box>
  );
}

// --- Amend Prompt ---

interface AmendPromptProps {
  onAmend: () => void;
  onSkip: () => void;
}

function AmendPrompt({ onAmend, onSkip }: AmendPromptProps) {
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === 'y' || input === 'Y') {
      onAmend();
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
      <Text>Amend changes to initial commit?</Text>
      <Text dimColor>(y/n)</Text>
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

  // Save the commit hash so we can amend to it later
  const commitHash = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();

  // Hand off to claude inside the devcontainer
  console.log('\n' + chalk.cyan('◆') + ' Starting claude…\n');
  const result = spawnSync(
    'devcontainer',
    ['exec', 'claude', '--dangerously-skip-permissions', promptText],
    { stdio: 'inherit' },
  );

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

  // Show a diff of everything that changed since our initial commit
  console.log('\n' + chalk.cyan('◆') + ' Changes since initial commit:\n');

  spawnSync('git', ['diff', '--stat', '--color=always', commitHash], {
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
  spawnSync('git', ['diff', '--color=always', commitHash], {
    stdio: 'inherit',
  });

  // Ask whether to amend all changes into the initial commit
  let shouldAmend = false;

  const { waitUntilExit: waitAmend } = render(
    React.createElement(AmendPrompt, {
      onAmend: () => {
        shouldAmend = true;
      },
      onSkip: () => {},
    }),
  );

  await waitAmend();

  if (shouldAmend) {
    try {
      execFileSync('git', ['add', '-A']);

      if (hasNewCommits) {
        execFileSync('git', ['reset', '--soft', commitHash]);
      }

      execFileSync('git', ['commit', '--amend', '--no-edit'], {
        stdio: 'inherit',
      });

      console.log('\n' + chalk.green('✓') + ' Changes amended to initial commit.');
    } catch {
      console.error(chalk.red.bold('\n  ✗ Failed to amend commit'));
      process.exit(1);
    }
  }

  process.exit(result.status ?? 0);
}

main().catch((err: Error) => {
  console.error(chalk.red.bold('Error:'), err.message);
  process.exit(1);
});
