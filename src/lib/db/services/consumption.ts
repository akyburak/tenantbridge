// src/lib/db/services/consumption.ts
import { eq, and, or, desc, asc, gte, lte, count, avg, sum, sql, inArray } from 'drizzle-orm';
import { db } from '../db';
import { 
  consumptionRecords,
  contracts,
  buildings,
  tenantContracts,
  type ConsumptionRecord, 
  type NewConsumptionRecord 
} from '../schema';

export class ConsumptionService {
  /**
   * Create a new consumption record
   */
  static async create(data: Omit<NewConsumptionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<ConsumptionRecord> {
    const [record] = await db
      .insert(consumptionRecords)
      .values(data)
      .returning();

    return record;
  }

  /**
   * Create multiple consumption records (bulk import)
   */
  static async createBulk(
    data: Omit<NewConsumptionRecord, 'id' | 'createdAt' | 'updatedAt'>[]
  ): Promise<ConsumptionRecord[]> {
    if (data.length === 0) return [];

    return await db
      .insert(consumptionRecords)
      .values(data)
      .returning();
  }

  /**
   * Get consumption record by ID
   */
  static async getById(
    id: string, 
    organizationId: string,
    userId?: string,
    userRole?: string
  ): Promise<ConsumptionRecord | null> {
    let whereConditions = and(
      eq(consumptionRecords.id, id),
      eq(consumptionRecords.organizationId, organizationId)
    );

    // Tenant access control
    if (userRole === 'tenant' && userId) {
      const tenantContractIds = await db
        .select({ contractId: tenantContracts.contractId })
        .from(tenantContracts)
        .where(eq(tenantContracts.tenantId, userId));

      const contractIds = tenantContractIds.map(tc => tc.contractId);
      
      if (contractIds.length > 0) {
        whereConditions = and(
          whereConditions,
          inArray(consumptionRecords.contractId, contractIds)
        );
      } else {
        return null; // No access
      }
    }

    const [record] = await db
      .select()
      .from(consumptionRecords)
      .where(whereConditions)
      .limit(1);

    return record || null;
  }

  /**
   * Get consumption records with filtering
   */
  static async getRecords(
    organizationId: string,
    options: {
      contractId?: string;
      consumptionType?: string;
      period?: string;
      startPeriod?: string;
      endPeriod?: string;
      userId?: string;
      userRole?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const {
      contractId,
      consumptionType,
      period,
      startPeriod,
      endPeriod,
      userId,
      userRole,
      limit = 50,
      offset = 0
    } = options;

    let whereConditions = eq(consumptionRecords.organizationId, organizationId);

    // Apply filters
    if (contractId) {
      whereConditions = and(whereConditions, eq(consumptionRecords.contractId, contractId));
    }
    if (consumptionType) {
      whereConditions = and(whereConditions, eq(consumptionRecords.consumptionType, consumptionType));
    }
    if (period) {
      whereConditions = and(whereConditions, eq(consumptionRecords.period, period));
    }
    if (startPeriod) {
      whereConditions = and(whereConditions, gte(consumptionRecords.period, startPeriod));
    }
    if (endPeriod) {
      whereConditions = and(whereConditions, lte(consumptionRecords.period, endPeriod));
    }

    // Tenant access control
    if (userRole === 'tenant' && userId) {
      const tenantContractIds = await db
        .select({ contractId: tenantContracts.contractId })
        .from(tenantContracts)
        .where(eq(tenantContracts.tenantId, userId));

      const contractIds = tenantContractIds.map(tc => tc.contractId);
      
      if (contractIds.length > 0) {
        whereConditions = and(
          whereConditions,
          inArray(consumptionRecords.contractId, contractIds)
        );
      } else {
        return []; // No access
      }
    }

    return await db
      .select({
        record: consumptionRecords,
        contract: contracts,
        building: buildings,
      })
      .from(consumptionRecords)
      .leftJoin(contracts, eq(consumptionRecords.contractId, contracts.id))
      .leftJoin(buildings, eq(contracts.buildingId, buildings.id))
      .where(whereConditions)
      .orderBy(desc(consumptionRecords.period), desc(consumptionRecords.readingDate))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Update consumption record
   */
  static async update(
    id: string,
    organizationId: string,
    data: Partial<Omit<ConsumptionRecord, 'id' | 'organizationId' | 'createdAt'>>
  ): Promise<ConsumptionRecord | null> {
    const [record] = await db
      .update(consumptionRecords)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(consumptionRecords.id, id),
          eq(consumptionRecords.organizationId, organizationId)
        )
      )
      .returning();

    return record || null;
  }

  /**
   * Delete consumption record
   */
  static async delete(id: string, organizationId: string): Promise<boolean> {
    try {
      const [deleted] = await db
        .delete(consumptionRecords)
        .where(
          and(
            eq(consumptionRecords.id, id),
            eq(consumptionRecords.organizationId, organizationId)
          )
        )
        .returning();

      return !!deleted;
    } catch (error) {
      console.error('Failed to delete consumption record:', error);
      return false;
    }
  }

  /**
   * Get consumption analytics for a contract
   */
  static async getAnalytics(
    contractId: string,
    organizationId: string,
    options: {
      consumptionType?: string;
      startPeriod?: string;
      endPeriod?: string;
      userId?: string;
      userRole?: string;
    } = {}
  ) {
    const { consumptionType, startPeriod, endPeriod, userId, userRole } = options;

    // Check tenant access
    if (userRole === 'tenant' && userId) {
      const [tenantAccess] = await db
        .select({ contractId: tenantContracts.contractId })
        .from(tenantContracts)
        .where(
          and(
            eq(tenantContracts.contractId, contractId),
            eq(tenantContracts.tenantId, userId)
          )
        )
        .limit(1);

      if (!tenantAccess) return null;
    }

    let whereConditions = and(
      eq(consumptionRecords.contractId, contractId),
      eq(consumptionRecords.organizationId, organizationId)
    );

    if (consumptionType) {
      whereConditions = and(whereConditions, eq(consumptionRecords.consumptionType, consumptionType));
    }
    if (startPeriod) {
      whereConditions = and(whereConditions, gte(consumptionRecords.period, startPeriod));
    }
    if (endPeriod) {
      whereConditions = and(whereConditions, lte(consumptionRecords.period, endPeriod));
    }

    const [analytics] = await db
      .select({
        totalRecords: count(consumptionRecords.id),
        totalReading: sum(consumptionRecords.reading),
        avgReading: avg(consumptionRecords.reading),
        totalCost: sum(consumptionRecords.cost),
        avgCost: avg(consumptionRecords.cost),
        minReading: sql<number>`MIN(${consumptionRecords.reading})`,
        maxReading: sql<number>`MAX(${consumptionRecords.reading})`,
        latestReading: sql<number>`MAX(${consumptionRecords.reading}) FILTER (WHERE ${consumptionRecords.readingDate} = (SELECT MAX(reading_date) FROM consumption_records WHERE contract_id = ${contractId}))`,
      })
      .from(consumptionRecords)
      .where(whereConditions);

    // Get period-over-period data for charts
    const periodData = await db
      .select({
        period: consumptionRecords.period,
        consumptionType: consumptionRecords.consumptionType,
        totalReading: sum(consumptionRecords.reading),
        totalCost: sum(consumptionRecords.cost),
        recordCount: count(consumptionRecords.id),
      })
      .from(consumptionRecords)
      .where(whereConditions)
      .groupBy(consumptionRecords.period, consumptionRecords.consumptionType)
      .orderBy(asc(consumptionRecords.period));

    return {
      summary: {
        totalRecords: Number(analytics?.totalRecords || 0),
        totalReading: Number(analytics?.totalReading || 0),
        avgReading: Number(analytics?.avgReading || 0),
        totalCost: Number(analytics?.totalCost || 0),
        avgCost: Number(analytics?.avgCost || 0),
        minReading: Number(analytics?.minReading || 0),
        maxReading: Number(analytics?.maxReading || 0),
        latestReading: Number(analytics?.latestReading || 0),
      },
      periodData: periodData.map(p => ({
        period: p.period,
        consumptionType: p.consumptionType,
        totalReading: Number(p.totalReading || 0),
        totalCost: Number(p.totalCost || 0),
        recordCount: Number(p.recordCount || 0),
      })),
    };
  }

  /**
   * Get consumption comparison between contracts
   */
  static async getComparison(
    organizationId: string,
    contractIds: string[],
    options: {
      consumptionType?: string;
      period?: string;
    } = {}
  ) {
    const { consumptionType, period } = options;

    let whereConditions = and(
      eq(consumptionRecords.organizationId, organizationId),
      inArray(consumptionRecords.contractId, contractIds)
    );

    if (consumptionType) {
      whereConditions = and(whereConditions, eq(consumptionRecords.consumptionType, consumptionType));
    }
    if (period) {
      whereConditions = and(whereConditions, eq(consumptionRecords.period, period));
    }

    return await db
      .select({
        contractId: consumptionRecords.contractId,
        contract: contracts,
        building: buildings,
        totalReading: sum(consumptionRecords.reading),
        totalCost: sum(consumptionRecords.cost),
        avgReading: avg(consumptionRecords.reading),
        recordCount: count(consumptionRecords.id),
      })
      .from(consumptionRecords)
      .leftJoin(contracts, eq(consumptionRecords.contractId, contracts.id))
      .leftJoin(buildings, eq(contracts.buildingId, buildings.id))
      .where(whereConditions)
      .groupBy(
        consumptionRecords.contractId, 
        contracts.id, 
        contracts.unitNumber,
        contracts.contractNumber,
        buildings.id,
        buildings.name
      )
      .orderBy(desc(sum(consumptionRecords.reading)));
  }

  /**
   * Check if consumption record exists for period
   */
  static async existsForPeriod(
    contractId: string,
    consumptionType: string,
    period: string
  ): Promise<boolean> {
    const [existing] = await db
      .select({ id: consumptionRecords.id })
      .from(consumptionRecords)
      .where(
        and(
          eq(consumptionRecords.contractId, contractId),
          eq(consumptionRecords.consumptionType, consumptionType),
          eq(consumptionRecords.period, period)
        )
      )
      .limit(1);

    return !!existing;
  }
}