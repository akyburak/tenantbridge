// src/lib/db/utils.ts
import { sql } from 'drizzle-orm';
import { db } from './db';

/**
 * Set Row-Level Security context for the current session
 * This should be called at the start of API routes and server actions
 */
export async function setRLSContext(params: {
  organizationId: string;
  userId: string;
  userRole: string;
}) {
  const { organizationId, userId, userRole } = params;

  try {
    await db.execute(sql`
      SELECT 
        set_config('app.current_organization_id', ${organizationId}, true),
        set_config('app.current_user_id', ${userId}, true),
        set_config('app.current_user_role', ${userRole}, true)
    `);
  } catch (error) {
    console.error('Failed to set RLS context:', error);
    throw new Error('Database context setup failed');
  }
}

/**
 * Clear Row-Level Security context
 * Optional cleanup, mainly for testing
 */
export async function clearRLSContext() {
  try {
    await db.execute(sql`
      SELECT 
        set_config('app.current_organization_id', NULL, true),
        set_config('app.current_user_id', NULL, true),
        set_config('app.current_user_role', NULL, true)
    `);
  } catch (error) {
    console.error('Failed to clear RLS context:', error);
  }
}

/**
 * Execute a database operation with RLS context
 * Automatically sets and clears context
 */
export async function withRLSContext<T>(
  context: {
    organizationId: string;
    userId: string;
    userRole: string;
  },
  operation: () => Promise<T>
): Promise<T> {
  await setRLSContext(context);
  try {
    return await operation();
  } finally {
    await clearRLSContext();
  }
}

/**
 * Helper to create RLS context from user session
 */
export function createRLSContext(user: {
  id: string;
  organizationId: string;
  role: string;
}) {
  return {
    organizationId: user.organizationId,
    userId: user.id,
    userRole: user.role,
  };
}

/**
 * Database health check
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

/**
 * Get database stats (useful for admin dashboard)
 */
export async function getDatabaseStats() {
  try {
    const [stats] = await db.execute(sql`
      SELECT 
        (SELECT COUNT(*) FROM organizations) as organization_count,
        (SELECT COUNT(*) FROM users) as user_count,
        (SELECT COUNT(*) FROM buildings) as building_count,
        (SELECT COUNT(*) FROM contracts) as contract_count,
        (SELECT COUNT(*) FROM tickets) as ticket_count,
        (SELECT COUNT(*) FROM consumption_records) as consumption_count,
        (SELECT COUNT(*) FROM documents) as document_count
    `);
    
    return stats;
  } catch (error) {
    console.error('Failed to get database stats:', error);
    return null;
  }
}