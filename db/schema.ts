import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const comparisons = sqliteTable(
  'comparisons',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    criteria: text('criteria').notNull(),
    analysis: text('analysis').notNull(),
    canvas: text('canvas').notNull(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
  },
  (table) => ({ createdAtIdx: index('idx_comparisons_created_at').on(table.createdAt) }),
);

export const comparisonProducts = sqliteTable(
  'comparison_products',
  {
    id: text('id').primaryKey(),
    comparisonId: text('comparison_id').notNull(),
    url: text('url').notNull(),
    name: text('name').notNull(),
    merchant: text('merchant').notNull(),
    category: text('category').notNull(),
    price: real('price'),
    currency: text('currency'),
    metadata: text('metadata').notNull(),
  },
  (table) => ({ comparisonIdx: index('idx_comparison_products_comparison_id').on(table.comparisonId) }),
);

export const comparisonMessages = sqliteTable(
  'comparison_messages',
  {
    id: text('id').primaryKey(),
    comparisonId: text('comparison_id').notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
  },
  (table) => ({ comparisonIdx: index('idx_comparison_messages_comparison_id').on(table.comparisonId) }),
);
