// src/lib/db/services/buildings.ts
import { eq, and, or, desc, count, sum, like, sql } from 'drizzle-orm';
import { db } from '../db';
import { 
  buildings, 
  contracts, 
  tickets, 
  documents,
  type Building, 
  type NewBuilding 
} from '../schema';

export class BuildingService {
  /**
   * Create a new building
   */
  static async create(data: Omit<NewBuilding, 'id' | 'createdAt' | 'updatedAt'>): Promise<Building> {
    const [building] = await db
      .insert(buildings)
      .values(data)
      .returning();

    return building;
  }

  /**
   * Get building by ID with organization check
   */
  static async getById(id: string, organizationId: string): Promise<Building | null> {
    const [building] = await db
      .select()
      .from(buildings)
      .where(
        and(
          eq(buildings.id, id),
          eq(buildings.organizationId, organizationId)
        )
      )
      .limit(1);

    return building || null;
  }

  /**
   * Get all buildings for an organization
   */
  static async getByOrganization(
    organizationId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<Building[]> {
    const { limit = 50, offset = 0 } = options;

    return await db
      .select()
      .from(buildings)
      .where(eq(buildings.organizationId, organizationId))
      .orderBy(desc(buildings.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Update building
   */
  static async update(
    id: string,
    organizationId: string,
    data: Partial<Omit<Building, 'id' | 'organizationId' | 'createdAt'>>
  ): Promise<Building | null> {
    const [building] = await db
      .update(buildings)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(buildings.id, id),
          eq(buildings.organizationId, organizationId)
        )
      )
      .returning();

    return building || null;
  }

  /**
   * Delete building (only if no active contracts)
   */
  static async delete(id: string, organizationId: string): Promise<boolean> {
    try {
      // Check for active contracts
      const [activeContracts] = await db
        .select({ count: count(contracts.id) })
        .from(contracts)
        .where(
          and(
            eq(contracts.buildingId, id),
            eq(contracts.isActive, true)
          )
        );

      if (Number(activeContracts.count) > 0) {
        throw new Error('Cannot delete building with active contracts');
      }

      const [deleted] = await db
        .delete(buildings)
        .where(
          and(
            eq(buildings.id, id),
            eq(buildings.organizationId, organizationId)
          )
        )
        .returning();

      return !!deleted;
    } catch (error) {
      console.error('Failed to delete building:', error);
      return false;
    }
  }

  /**
   * Get building with detailed stats
   */
  static async getWithStats(id: string, organizationId: string) {
    const [building] = await db
      .select()
      .from(buildings)
      .where(
        and(
          eq(buildings.id, id),
          eq(buildings.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!building) return null;

    // Get detailed stats
    const [stats] = await db
      .select({
        totalContracts: count(contracts.id),
        activeContracts: sum(
          sql<number>`CASE WHEN ${contracts.isActive} THEN 1 ELSE 0 END`
        ),
        openTickets: sum(
          sql<number>`CASE WHEN ${tickets.status} IN ('open', 'in_progress') THEN 1 ELSE 0 END`
        ),
        documentCount: count(documents.id),
      })
      .from(buildings)
      .leftJoin(contracts, eq(buildings.id, contracts.buildingId))
      .leftJoin(tickets, eq(buildings.id, tickets.buildingId))
      .leftJoin(documents, eq(buildings.id, documents.buildingId))
      .where(eq(buildings.id, id));

    return {
      ...building,
      stats: {
        totalContracts: Number(stats?.totalContracts || 0),
        activeContracts: Number(stats?.activeContracts || 0),
        openTickets: Number(stats?.openTickets || 0),
        documentCount: Number(stats?.documentCount || 0),
        occupancyRate: building.totalUnits > 0 
          ? Math.round((Number(stats?.activeContracts || 0) / building.totalUnits) * 100)
          : 0,
      },
    };
  }

  /**
   * Get building occupancy details
   */
  static async getOccupancyDetails(id: string, organizationId: string) {
    const building = await this.getById(id, organizationId);
    if (!building) return null;

    // Get all contracts with unit numbers
    const contractsList = await db
      .select({
        id: contracts.id,
        unitNumber: contracts.unitNumber,
        contractNumber: contracts.contractNumber,
        isActive: contracts.isActive,
        startDate: contracts.startDate,
        endDate: contracts.endDate,
        rentAmount: contracts.rentAmount,
      })
      .from(contracts)
      .where(
        and(
          eq(contracts.buildingId, id),
          eq(contracts.organizationId, organizationId)
        )
      )
      .orderBy(contracts.unitNumber);

    const occupiedUnits = contractsList.filter(c => c.isActive).length;
    const availableUnits = building.totalUnits - occupiedUnits;

    return {
      building,
      contracts: contractsList,
      occupancy: {
        total: building.totalUnits,
        occupied: occupiedUnits,
        available: availableUnits,
        rate: building.totalUnits > 0 ? Math.round((occupiedUnits / building.totalUnits) * 100) : 0,
      },
    };
  }

  /**
   * Search buildings by name or address
   */
  static async search(
    organizationId: string,
    searchTerm: string,
    limit = 10
  ): Promise<Building[]> {
    return await db
      .select()
      .from(buildings)
      .where(
        and(
          eq(buildings.organizationId, organizationId),
          or(
            like(buildings.name, `%${searchTerm}%`),
            like(buildings.address, `%${searchTerm}%`),
            like(buildings.city, `%${searchTerm}%`)
          )
        )
      )
      .limit(limit);
  }
}