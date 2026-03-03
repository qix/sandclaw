import knex, { Knex } from 'knex';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from './logger';

export function createDb(dbPath: string): Knex {
  mkdirSync(dirname(dbPath), { recursive: true });
  logger.info({ dbPath }, 'Opening SQLite database');
  return knex({
    client: 'better-sqlite3',
    connection: { filename: dbPath },
    useNullAsDefault: true,
  });
}

export async function runCoreMigrations(db: Knex): Promise<void> {
  if (!(await db.schema.hasTable('verification_requests'))) {
    await db.schema.createTable('verification_requests', (t) => {
      t.increments('id');
      t.text('plugin').notNullable();
      t.text('action').notNullable();
      t.text('data').notNullable();
      t.text('status').notNullable().defaultTo('pending');
      t.integer('created_at');
      t.integer('updated_at');
    });
  }

  if (!(await db.schema.hasTable('safe_queue'))) {
    await db.schema.createTable('safe_queue', (t) => {
      t.increments('id');
      t.text('job_type').notNullable();
      t.text('data').notNullable();
      t.text('context');
      t.text('status').notNullable().defaultTo('pending');
      t.integer('created_at');
      t.integer('updated_at');
    });
  }

  if (!(await db.schema.hasTable('confidante_queue'))) {
    await db.schema.createTable('confidante_queue', (t) => {
      t.increments('id');
      t.text('job_type').notNullable();
      t.text('data').notNullable();
      t.text('result');
      t.text('status').notNullable().defaultTo('pending');
      t.integer('created_at');
      t.integer('updated_at');
    });
  }

  if (!(await db.schema.hasTable('conversations'))) {
    await db.schema.createTable('conversations', (t) => {
      t.increments('id');
      t.text('plugin').notNullable();
      t.text('channel').notNullable();
      t.text('external_id').notNullable();
      t.integer('created_at');
      t.unique(['plugin', 'channel', 'external_id']);
    });
  }

  if (!(await db.schema.hasTable('conversation_message'))) {
    await db.schema.createTable('conversation_message', (t) => {
      t.increments('id');
      t.integer('conversation_id').notNullable();
      t.text('plugin').notNullable();
      t.text('channel').notNullable();
      t.text('message_id').notNullable();
      t.text('thread_id');
      t.text('from');
      t.text('to');
      t.integer('timestamp').notNullable();
      t.text('direction').notNullable();
      t.text('text');
      t.integer('created_at');
    });
  }
}
