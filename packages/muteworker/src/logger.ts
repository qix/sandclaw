import pino from 'pino';

type Level = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private readonly pino: pino.Logger;

  constructor(minLevel: Level) {
    this.pino = pino({
      name: 'muteworker',
      level: minLevel,
      transport: {
        target: 'pino-pretty',
      },
    });
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.pino.debug(data ?? {}, message);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.pino.info(data ?? {}, message);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.pino.warn(data ?? {}, message);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.pino.error(data ?? {}, message);
  }
}

export function createLogger(level: Level): Logger {
  return new Logger(level);
}
