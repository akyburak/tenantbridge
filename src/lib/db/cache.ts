// src/lib/db/cache.ts
import { env } from '../env';

/**
 * In-memory cache for frequently accessed data
 * Note: This is a simple implementation. In production, consider Redis.
 */
class MemoryCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes

  set(key: string, data: any, ttl = this.defaultTTL) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });

    // Auto cleanup old entries
    this.cleanup();
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  delete(key: string) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Global cache instance
const cache = new MemoryCache();

/**
 * Cache key generators
 */
export const CacheKeys = {
  organization: (id: string) => `org:${id}`,
  organizationStats: (id: string) => `org:stats:${id}`,
  buildingList: (orgId: string) => `buildings:${orgId}`,
  buildingStats: (buildingId: string) => `building:stats:${buildingId}`,
  contractDetails: (contractId: string) => `contract:${contractId}`,
  userDashboard: (userId: string) => `user:dashboard:${userId}`,
  ticketStats: (orgId: string, userId?: string) => `tickets:stats:${orgId}:${userId || 'all'}`,
  consumptionAnalytics: (contractId: string, period: string) => `consumption:${contractId}:${period}`,
  realTimeMetrics: (orgId: string) => `metrics:${orgId}`,
};

/**
 * Cached database operations
 */
export class CachedOperations {
  /**
   * Cache wrapper for any operation
   */
  static async withCache<T>(
    key: string,
    operation: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Check cache first
    const cached = cache.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Execute operation and cache result
    const result = await operation();
    cache.set(key, result, ttl);
    
    return result;
  }

  /**
   * Invalidate cache entries by pattern
   */
  static invalidatePattern(pattern: string) {
    const regex = new RegExp(pattern);
    const keysToDelete: string[] = [];
    
    for (const key of cache.getStats().keys) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => cache.delete(key));
  }

  /**
   * Invalidate organization-related cache
   */
  static invalidateOrganization(organizationId: string) {
    this.invalidatePattern(`^(org|buildings|contracts|tickets|users|metrics):.*${organizationId}`);
  }

  /**
   * Invalidate building-related cache
   */
  static invalidateBuilding(buildingId: string, organizationId: string) {
    cache.delete(CacheKeys.buildingStats(buildingId));
    cache.delete(CacheKeys.buildingList(organizationId));
    this.invalidatePattern(`^metrics:${organizationId}`);
  }

  /**
   * Invalidate contract-related cache
   */
  static invalidateContract(contractId: string, organizationId: string) {
    cache.delete(CacheKeys.contractDetails(contractId));
    this.invalidatePattern(`^consumption:${contractId}`);
    this.invalidatePattern(`^metrics:${organizationId}`);
  }

  /**
   * Invalidate user dashboard cache
   */
  static invalidateUserDashboard(userId: string, organizationId: string) {
    cache.delete(CacheKeys.userDashboard(userId));
    cache.delete(CacheKeys.ticketStats(organizationId, userId));
    cache.delete(CacheKeys.realTimeMetrics(organizationId));
  }

  /**
   * Get cache statistics
   */
  static getCacheStats() {
    return cache.getStats();
  }

  /**
   * Clear all cache
   */
  static clearAll() {
    cache.clear();
  }
}

/**
 * Cached service wrappers
 */
export class CachedServices {
  /**
   * Get organization with caching
   */
  static async getOrganization(id: string) {
    return await CachedOperations.withCache(
      CacheKeys.organization(id),
      async () => {
        const { OrganizationService } = await import('./organizations');
        return OrganizationService.getById(id);
      },
      10 * 60 * 1000 // 10 minutes
    );
  }

  /**
   * Get organization stats with caching
   */
  static async getOrganizationStats(id: string) {
    return await CachedOperations.withCache(
      CacheKeys.organizationStats(id),
      async () => {
        const { OrganizationService } = await import('./organizations');
        return OrganizationService.getWithStats(id);
      },
      2 * 60 * 1000 // 2 minutes
    );
  }

  /**
   * Get buildings with caching
   */
  static async getBuildings(organizationId: string) {
    return await CachedOperations.withCache(
      CacheKeys.buildingList(organizationId),
      async () => {
        const { BuildingService } = await import('./buildings');
        return BuildingService.getByOrganization(organizationId);
      },
      5 * 60 * 1000 // 5 minutes
    );
  }

  /**
   * Get user dashboard data with caching
   */
  static async getUserDashboard(userId: string, organizationId: string) {
    return await CachedOperations.withCache(
      CacheKeys.userDashboard(userId),
      async () => {
        const { UserService } = await import('./users');
        return UserService.getDashboardData(userId, organizationId);
      },
      1 * 60 * 1000 // 1 minute
    );
  }

  /**
   * Get real-time metrics with caching
   */
  static async getRealTimeMetrics(organizationId: string) {
    return await CachedOperations.withCache(
      CacheKeys.realTimeMetrics(organizationId),
      async () => {
        const { getRealTimeMetrics } = await import('./monitoring');
        return getRealTimeMetrics(organizationId);
      },
      30 * 1000 // 30 seconds for real-time data
    );
  }
}

/**
 * Cache warming strategies
 */
export class CacheWarmer {
  /**
   * Warm essential data for an organization
   */
  static async warmOrganizationCache(organizationId: string) {
    const operations = [
      () => CachedServices.getOrganization(organizationId),
      () => CachedServices.getOrganizationStats(organizationId),
      () => CachedServices.getBuildings(organizationId),
      () => CachedServices.getRealTimeMetrics(organizationId),
    ];

    const results = await Promise.allSettled(operations.map(op => op()));
    const successful = results.filter(r => r.status === 'fulfilled').length;
    
    return {
      warmed: successful,
      total: operations.length,
      organizationId,
    };
  }

  /**
   * Warm user-specific cache
   */
  static async warmUserCache(userId: string, organizationId: string) {
    try {
      await CachedServices.getUserDashboard(userId, organizationId);
      return true;
    } catch (error) {
      console.error('Failed to warm user cache:', error);
      return false;
    }
  }

  /**
   * Background cache refresh
   */
  static async refreshBackground(organizationId: string) {
    // Run cache refresh without waiting
    setImmediate(async () => {
      try {
        await this.warmOrganizationCache(organizationId);
      } catch (error) {
        console.error('Background cache refresh failed:', error);
      }
    });
  }
}

/**
 * Cache invalidation hooks for data mutations
 */
export class CacheInvalidator {
  static onOrganizationUpdate(organizationId: string) {
    CachedOperations.invalidateOrganization(organizationId);
  }

  static onBuildingUpdate(buildingId: string, organizationId: string) {
    CachedOperations.invalidateBuilding(buildingId, organizationId);
  }

  static onContractUpdate(contractId: string, organizationId: string) {
    CachedOperations.invalidateContract(contractId, organizationId);
  }

  static onTicketUpdate(ticketId: string, organizationId: string, userId?: string) {
    CachedOperations.invalidatePattern(`^tickets:.*${organizationId}`);
    CachedOperations.invalidatePattern(`^metrics:${organizationId}`);
    
    if (userId) {
      CachedOperations.invalidateUserDashboard(userId, organizationId);
    }
  }

  static onUserUpdate(userId: string, organizationId: string) {
    CachedOperations.invalidateUserDashboard(userId, organizationId);
    CachedOperations.invalidatePattern(`^org:stats:${organizationId}`);
  }

  static onConsumptionUpdate(contractId: string, organizationId: string) {
    CachedOperations.invalidatePattern(`^consumption:${contractId}`);
    CachedOperations.invalidatePattern(`^metrics:${organizationId}`);
  }
}

// Export cache instance for manual operations
export { cache as cacheInstance };