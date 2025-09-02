// src/lib/db/monitoring.ts
import { sql, count, eq, and, lte, desc } from 'drizzle-orm';
import { db } from './db';
import { env } from '../env';
import { 
  organizations,
  buildings,
  contracts,
  tickets,
  consumptionRecords,
  documents,
  users
} from './schema';

/**
 * Database performance metrics
 */
export interface PerformanceMetrics {
  queryTime: number;
  connectionCount: number;
  tableStats: Record<string, { rows: number; size: string }>;
  slowQueries: Array<{ query: string; duration: number }>;
  indexUsage: Array<{ table: string; index: string; usage: number }>;
}

/**
 * Monitor query performance
 */
export class QueryMonitor {
  private static queryLog: Array<{ query: string; duration: number; timestamp: Date }> = [];
  private static readonly MAX_LOG_SIZE = 1000;

  static startTimer(): { end: () => number } {
    const start = performance.now();
    return {
      end: () => performance.now() - start,
    };
  }

  static logQuery(query: string, duration: number) {
    this.queryLog.push({
      query,
      duration,
      timestamp: new Date(),
    });

    // Keep only recent queries
    if (this.queryLog.length > this.MAX_LOG_SIZE) {
      this.queryLog = this.queryLog.slice(-this.MAX_LOG_SIZE);
    }

    // Log slow queries in development
    if (env.NODE_ENV === 'development' && duration > 1000) {
      console.warn(`🐌 Slow query detected (${duration}ms):`, query.substring(0, 100));
    }
  }

  static getSlowQueries(thresholdMs = 500): Array<{ query: string; duration: number }> {
    return this.queryLog
      .filter(log => log.duration > thresholdMs)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
  }

  static getQueryStats() {
    const total = this.queryLog.length;
    if (total === 0) return null;

    const durations = this.queryLog.map(log => log.duration);
    const avg = durations.reduce((sum, d) => sum + d, 0) / total;
    const max = Math.max(...durations);
    const min = Math.min(...durations);

    return {
      total,
      averageDuration: avg,
      maxDuration: max,
      minDuration: min,
      slowQueries: this.getSlowQueries().length,
    };
  }

  static clearLog() {
    this.queryLog = [];
  }
}

/**
 * Database health checker
 */
export class DatabaseHealth {
  /**
   * Check database connection and basic health
   */
  static async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Array<{ name: string; status: boolean; duration: number; message?: string }>;
  }> {
    const checks: Array<{ name: string; status: boolean; duration: number; message?: string }> = [];

    // Connection test
    const connectionTimer = QueryMonitor.startTimer();
    try {
      await db.execute(sql`SELECT 1 as health_check`);
      checks.push({
        name: 'Database Connection',
        status: true,
        duration: connectionTimer.end(),
      });
    } catch (error) {
      checks.push({
        name: 'Database Connection',
        status: false,
        duration: connectionTimer.end(),
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    }

    // Query performance test
    const performanceTimer = QueryMonitor.startTimer();
    try {
      await db.execute(sql`SELECT COUNT(*) FROM organizations`);
      const duration = performanceTimer.end();
      checks.push({
        name: 'Query Performance',
        status: duration < 1000, // Should be under 1 second
        duration,
        message: duration > 1000 ? 'Queries are slow' : undefined,
      });
    } catch (error) {
      checks.push({
        name: 'Query Performance',
        status: false,
        duration: performanceTimer.end(),
        message: error instanceof Error ? error.message : 'Query failed',
      });
    }

    // Table access test
    const tablesTimer = QueryMonitor.startTimer();
    try {
      await Promise.all([
        db.execute(sql`SELECT 1 FROM organizations LIMIT 1`),
        db.execute(sql`SELECT 1 FROM users LIMIT 1`),
        db.execute(sql`SELECT 1 FROM buildings LIMIT 1`),
      ]);
      checks.push({
        name: 'Table Access',
        status: true,
        duration: tablesTimer.end(),
      });
    } catch (error) {
      checks.push({
        name: 'Table Access',
        status: false,
        duration: tablesTimer.end(),
        message: error instanceof Error ? error.message : 'Table access failed',
      });
    }

    // Determine overall status
    const allPassed = checks.every(check => check.status);
    const criticalFailed = checks.some(check => 
      !check.status && ['Database Connection', 'Table Access'].includes(check.name)
    );

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (allPassed) {
      status = 'healthy';
    } else if (criticalFailed) {
      status = 'unhealthy';
    } else {
      status = 'degraded';
    }

    return { status, checks };
  }

  /**
   * Get database statistics
   */
  static async getStatistics() {
    try {
      const [stats] = await db.execute(sql`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes,
          n_live_tup as live_rows,
          n_dead_tup as dead_rows
        FROM pg_stat_user_tables 
        WHERE schemaname = 'public'
        ORDER BY n_live_tup DESC
      `);

      return stats;
    } catch (error) {
      console.error('Failed to get database statistics:', error);
      return null;
    }
  }

  /**
   * Get connection pool status
   */
  static async getConnectionInfo() {
    try {
      const [connections] = await db.execute(sql`
        SELECT 
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `);

      return connections;
    } catch (error) {
      console.error('Failed to get connection info:', error);
      return null;
    }
  }

  /**
   * Get table sizes
   */
  static async getTableSizes() {
    try {
      const sizes = await db.execute(sql`
        SELECT 
          tablename,
          pg_size_pretty(pg_total_relation_size(tablename::regclass)) as size,
          pg_total_relation_size(tablename::regclass) as bytes
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(tablename::regclass) DESC
      `);

      return sizes;
    } catch (error) {
      console.error('Failed to get table sizes:', error);
      return null;
    }
  }
}

/**
 * Performance optimization utilities
 */
export class DatabaseOptimizer {
  /**
   * Analyze query performance and suggest optimizations
   */
  static async analyzePerformance(organizationId: string) {
    const issues: string[] = [];
    const suggestions: string[] = [];

    try {
      // Check for missing indexes on frequently queried columns
      const largeTables = await DatabaseHealth.getTableSizes();
      if (largeTables && largeTables.length > 0) {
        const large = largeTables.filter((table: any) => table.bytes > 1000000); // 1MB+
        if (large.length > 0) {
          suggestions.push(`Consider partitioning large tables: ${large.map((t: any) => t.tablename).join(', ')}`);
        }
      }

      // Check for unused indexes (requires pg_stat_user_indexes)
      try {
        const [indexUsage] = await db.execute(sql`
          SELECT 
            schemaname,
            tablename,
            indexname,
            idx_scan
          FROM pg_stat_user_indexes 
          WHERE schemaname = 'public' AND idx_scan = 0
        `);

        if (indexUsage && Array.isArray(indexUsage) && indexUsage.length > 0) {
          suggestions.push(`Consider removing unused indexes: ${indexUsage.length} found`);
        }
      } catch (e) {
        // pg_stat_user_indexes might not be available
      }

      // Check query patterns from monitor
      const queryStats = QueryMonitor.getQueryStats();
      if (queryStats && queryStats.slowQueries > 0) {
        issues.push(`Found ${queryStats.slowQueries} slow queries (>500ms)`);
        suggestions.push('Review slow queries and add appropriate indexes');
      }

      // Check for high row counts
      const [tableCounts] = await db.execute(sql`
        SELECT 
          'organizations' as table_name, COUNT(*) as row_count FROM organizations
        UNION ALL
        SELECT 'buildings', COUNT(*) FROM buildings
        UNION ALL  
        SELECT 'contracts', COUNT(*) FROM contracts
        UNION ALL
        SELECT 'tickets', COUNT(*) FROM tickets
        UNION ALL
        SELECT 'consumption_records', COUNT(*) FROM consumption_records
        UNION ALL
        SELECT 'documents', COUNT(*) FROM documents
      `);

      const highVolumeTables = (tableCounts as any[])?.filter(
        (table: any) => Number(table.row_count) > 10000
      );

      if (highVolumeTables && highVolumeTables.length > 0) {
        suggestions.push(`High volume tables detected: ${highVolumeTables.map((t: any) => `${t.table_name} (${t.row_count} rows)`).join(', ')}`);
      }

      return {
        issues,
        suggestions,
        queryStats,
        timestamp: new Date(),
      };

    } catch (error) {
      console.error('Performance analysis failed:', error);
      return {
        issues: ['Performance analysis failed'],
        suggestions: [],
        queryStats: null,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Vacuum and analyze tables for performance
   */
  static async optimizeTables() {
    if (env.NODE_ENV === 'production') {
      console.log('⚠️  Table optimization should be run during maintenance windows in production');
      return false;
    }

    try {
      console.log('🔧 Optimizing database tables...');
      
      const tables = [
        'organizations',
        'users', 
        'buildings',
        'contracts',
        'tenant_contracts',
        'tickets',
        'consumption_records',
        'documents',
        'invitation_tokens'
      ];

      for (const table of tables) {
        await db.execute(sql.raw(`ANALYZE ${table}`));
        console.log(`✅ Analyzed table: ${table}`);
      }

      console.log('✅ Table optimization completed');
      return true;
    } catch (error) {
      console.error('Table optimization failed:', error);
      return false;
    }
  }
}

/**
 * Database monitoring middleware
 */
export function createMonitoringWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  queryName: string
): T {
  return (async (...args: any[]) => {
    const timer = QueryMonitor.startTimer();
    
    try {
      const result = await fn(...args);
      QueryMonitor.logQuery(queryName, timer.end());
      return result;
    } catch (error) {
      QueryMonitor.logQuery(`${queryName} (ERROR)`, timer.end());
      throw error;
    }
  }) as T;
}

/**
 * Real-time metrics for dashboard
 */
export async function getRealTimeMetrics(organizationId: string) {
  const timer = QueryMonitor.startTimer();

  try {
    const [metrics] = await db.execute(sql`
      SELECT 
        (SELECT COUNT(*) FROM tickets WHERE organization_id = ${organizationId} AND status IN ('open', 'in_progress')) as open_tickets,
        (SELECT COUNT(*) FROM contracts WHERE organization_id = ${organizationId} AND is_active = true) as active_contracts,
        (SELECT COUNT(*) FROM users WHERE organization_id = ${organizationId} AND role = 'tenant' AND is_active = true) as active_tenants,
        (SELECT COALESCE(SUM(CAST(rent_amount AS DECIMAL)), 0) FROM contracts WHERE organization_id = ${organizationId} AND is_active = true) as monthly_revenue,
        (SELECT COUNT(*) FROM tickets WHERE organization_id = ${organizationId} AND created_at >= NOW() - INTERVAL '7 days') as tickets_this_week,
        (SELECT COUNT(*) FROM consumption_records WHERE organization_id = ${organizationId} AND created_at >= NOW() - INTERVAL '30 days') as consumption_updates_this_month
    `);

    const queryDuration = timer.end();
    QueryMonitor.logQuery('getRealTimeMetrics', queryDuration);

    return {
      openTickets: Number(metrics?.open_tickets || 0),
      activeContracts: Number(metrics?.active_contracts || 0),
      activeTenants: Number(metrics?.active_tenants || 0),
      monthlyRevenue: Number(metrics?.monthly_revenue || 0),
      ticketsThisWeek: Number(metrics?.tickets_this_week || 0),
      consumptionUpdatesThisMonth: Number(metrics?.consumption_updates_this_month || 0),
      queryDuration,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('Failed to get real-time metrics:', error);
    throw error;
  }
}

/**
 * Database cache warming for frequently accessed data
 */
export async function warmCache(organizationId: string) {
  console.log('🔥 Warming database cache...');

  const queries = [
    // Warm up organization data
    () => db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1),
    
    // Warm up buildings
    () => db.select().from(buildings).where(eq(buildings.organizationId, organizationId)),
    
    // Warm up active contracts
    () => db.select().from(contracts).where(
      and(
        eq(contracts.organizationId, organizationId),
        eq(contracts.isActive, true)
      )
    ),
    
    // Warm up recent tickets
    () => db.select().from(tickets)
      .where(eq(tickets.organizationId, organizationId))
      .orderBy(desc(tickets.createdAt))
      .limit(20),
  ];

  const results = await Promise.allSettled(queries.map(query => query()));
  const successful = results.filter(result => result.status === 'fulfilled').length;
  
  console.log(`✅ Cache warming completed: ${successful}/${queries.length} queries successful`);
  
  return {
    successful,
    total: queries.length,
    results,
  };
}

/**
 * Auto-cleanup old data
 */
export async function cleanupOldData(organizationId: string, options: {
  ticketRetentionDays?: number;
  consumptionRetentionMonths?: number;
  documentRetentionDays?: number;
} = {}) {
  const {
    ticketRetentionDays = 365,
    consumptionRetentionMonths = 24,
    documentRetentionDays = 730,
  } = options;

  console.log('🧹 Starting data cleanup...');

  const results = {
    cleanedTickets: 0,
    cleanedConsumption: 0,
    cleanedDocuments: 0,
  };

  try {
    // Cleanup old resolved tickets
    const ticketCutoffDate = new Date();
    ticketCutoffDate.setDate(ticketCutoffDate.getDate() - ticketRetentionDays);

    const deletedTickets = await db
      .delete(tickets)
      .where(
        and(
          eq(tickets.organizationId, organizationId),
          eq(tickets.status, 'closed'),
          lte(tickets.resolvedAt, ticketCutoffDate)
        )
      )
      .returning({ id: tickets.id });

    results.cleanedTickets = deletedTickets.length;

    // Cleanup old consumption records
    const consumptionCutoffDate = new Date();
    consumptionCutoffDate.setMonth(consumptionCutoffDate.getMonth() - consumptionRetentionMonths);
    const cutoffPeriod = `${consumptionCutoffDate.getFullYear()}-${(consumptionCutoffDate.getMonth() + 1).toString().padStart(2, '0')}`;

    const deletedConsumption = await db
      .delete(consumptionRecords)
      .where(
        and(
          eq(consumptionRecords.organizationId, organizationId),
          lte(consumptionRecords.period, cutoffPeriod)
        )
      )
      .returning({ id: consumptionRecords.id });

    results.cleanedConsumption = deletedConsumption.length;

    // Cleanup old temporary documents
    const documentCutoffDate = new Date();
    documentCutoffDate.setDate(documentCutoffDate.getDate() - documentRetentionDays);

    const deletedDocuments = await db
      .delete(documents)
      .where(
        and(
          eq(documents.organizationId, organizationId),
          eq(documents.category, 'other'),
          lte(documents.createdAt, documentCutoffDate)
        )
      )
      .returning({ id: documents.id });

    results.cleanedDocuments = deletedDocuments.length;

    console.log(`✅ Cleanup completed: ${results.cleanedTickets} tickets, ${results.cleanedConsumption} consumption records, ${results.cleanedDocuments} documents`);

    return results;
  } catch (error) {
    console.error('Data cleanup failed:', error);
    throw error;
  }
}