// src/lib/db/db.ts
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create a pool for better connection management
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
});

// Create the database instance with schema
export const db = drizzle(pool, { 
  schema,
  logger: process.env.NODE_ENV === 'development',
});

// Export pool for cleanup if needed
export { pool };