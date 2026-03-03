type Level = 'debug' | 'info' | 'warn' | 'error';

const levelOrder: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  constructor(private readonly minLevel: Level) {}

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  private log(level: Level, message: string, data?: Record<string, unknown>): void {
    if (levelOrder[level] < levelOrder[this.minLevel]) {
      return;
    }

    const now = new Date();
    const timeStr = [
      now.getHours().toString().padStart(2, '0'),
      now.getMinutes().toString().padStart(2, '0'),
      now.getSeconds().toString().padStart(2, '0'),
    ].join(':');

    let levelStr = `[${level.toUpperCase()}]`;
    switch (level) {
      case 'debug': levelStr = `\x1b[90m${levelStr}\x1b[0m`; break;
      case 'info':  levelStr = `\x1b[34m${levelStr}\x1b[0m`; break;
      case 'warn':  levelStr = `\x1b[33m${levelStr}\x1b[0m`; break;
      case 'error': levelStr = `\x1b[31m${levelStr}\x1b[0m`; break;
    }

    let outStr = `\x1b[90m${timeStr}\x1b[0m ${levelStr} ${message}`;
    if (data && Object.keys(data).length > 0) {
      let dataStr = JSON.stringify(data);
      if (dataStr.length > 500) {
        dataStr = dataStr.substring(0, 500) + '... (truncated)';
      }
      outStr += ` \x1b[90m${dataStr}\x1b[0m`;
    }

    console.log(outStr);
  }
}

export function createLogger(level: Level): Logger {
  return new Logger(level);
}
