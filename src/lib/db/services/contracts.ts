// src/lib/db/services/contracts.ts
import { eq, and, or, ne, desc, asc, gte, lte, count, like, sql } from 'drizzle-orm';
import { db } from '../db';
import { 
  contracts, 
  tenantContracts,
  buildings,
  users,
  consumptionRecords,
  tickets,
  type Contract, 
  type NewContract,
  type TenantContract,
  type NewTenantContract 
} from '../schema';

export class ContractService {
  /**
   * Create a new contract
   */
  static async create(data: Omit<NewContract, 'id' | 'createdAt' | 'updatedAt'>): Promise<Contract> {
    const [contract] = await db
      .insert(contracts)
      .values(data)
      .returning();

    return contract;
  }

  /**
   * Get contract by ID with organization check
   */
  static async getById(id: string, organizationId: string): Promise<Contract | null> {
    const [contract] = await db
      .select()
      .from(contracts)
      .where(
        and(
          eq(contracts.id, id),
          eq(contracts.organizationId, organizationId)
        )
      )
      .limit(1);

    return contract || null;
  }

  /**
   * Get contract with full details (building, tenants)
   */
  static async getWithDetails(id: string, organizationId: string) {
    const [contractData] = await db
      .select({
        contract: contracts,
        building: buildings,
      })
      .from(contracts)
      .leftJoin(buildings, eq(contracts.buildingId, buildings.id))
      .where(
        and(
          eq(contracts.id, id),
          eq(contracts.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!contractData) return null;

    // Get tenants for this contract
    const tenants = await db
      .select({
        tenantContract: tenantContracts,
        tenant: users,
      })
      .from(tenantContracts)
      .leftJoin(users, eq(tenantContracts.tenantId, users.id))
      .where(eq(tenantContracts.contractId, id))
      .orderBy(desc(tenantContracts.isMainTenant), asc(users.name));

    return {
      ...contractData.contract,
      building: contractData.building,
      tenants: tenants.map(t => ({
        ...t.tenantContract,
        tenant: t.tenant,
      })),
    };
  }

  /**
   * Get all contracts for an organization
   */
  static async getByOrganization(
    organizationId: string,
    options: {
      buildingId?: string;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Contract[]> {
    const { buildingId, isActive, limit = 50, offset = 0 } = options;

    let query = db
      .select()
      .from(contracts)
      .where(eq(contracts.organizationId, organizationId));

    if (buildingId) {
      query = query.where(eq(contracts.buildingId, buildingId));
    }

    if (isActive !== undefined) {
      query = query.where(eq(contracts.isActive, isActive));
    }

    return await query
      .orderBy(desc(contracts.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get contracts for a specific tenant
   */
  static async getByTenant(tenantId: string, organizationId: string): Promise<any[]> {
    return await db
      .select({
        contract: contracts,
        building: buildings,
        tenantContract: tenantContracts,
      })
      .from(tenantContracts)
      .leftJoin(contracts, eq(tenantContracts.contractId, contracts.id))
      .leftJoin(buildings, eq(contracts.buildingId, buildings.id))
      .where(
        and(
          eq(tenantContracts.tenantId, tenantId),
          eq(tenantContracts.organizationId, organizationId)
        )
      )
      .orderBy(desc(tenantContracts.createdAt));
  }

  /**
   * Update contract
   */
  static async update(
    id: string,
    organizationId: string,
    data: Partial<Omit<Contract, 'id' | 'organizationId' | 'createdAt'>>
  ): Promise<Contract | null> {
    const [contract] = await db
      .update(contracts)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(contracts.id, id),
          eq(contracts.organizationId, organizationId)
        )
      )
      .returning();

    return contract || null;
  }

  /**
   * Add tenant to contract
   */
  static async addTenant(
    contractId: string,
    organizationId: string,
    tenantData: Omit<NewTenantContract, 'id' | 'organizationId' | 'contractId' | 'createdAt'>
  ): Promise<TenantContract | null> {
    // Verify contract exists and belongs to organization
    const contract = await this.getById(contractId, organizationId);
    if (!contract) return null;

    const [tenantContract] = await db
      .insert(tenantContracts)
      .values({
        ...tenantData,
        contractId,
        organizationId,
      })
      .returning();

    return tenantContract;
  }

  /**
   * Remove tenant from contract
   */
  static async removeTenant(
    contractId: string,
    tenantId: string,
    organizationId: string
  ): Promise<boolean> {
    try {
      const [deleted] = await db
        .delete(tenantContracts)
        .where(
          and(
            eq(tenantContracts.contractId, contractId),
            eq(tenantContracts.tenantId, tenantId),
            eq(tenantContracts.organizationId, organizationId)
          )
        )
        .returning();

      return !!deleted;
    } catch (error) {
      console.error('Failed to remove tenant from contract:', error);
      return false;
    }
  }

  /**
   * Get contract with activity summary
   */
  static async getWithActivity(id: string, organizationId: string) {
    const contractDetails = await this.getWithDetails(id, organizationId);
    if (!contractDetails) return null;

    // Get recent activity
    const [activity] = await db
      .select({
        totalTickets: count(tickets.id),
        openTickets: sum(
          sql<number>`CASE WHEN ${tickets.status} IN ('open', 'in_progress') THEN 1 ELSE 0 END`
        ),
        lastTicketDate: sql<Date>`MAX(${tickets.createdAt})`,
        totalConsumptionRecords: count(consumptionRecords.id),
        lastConsumptionDate: sql<Date>`MAX(${consumptionRecords.readingDate})`,
      })
      .from(contracts)
      .leftJoin(tickets, eq(contracts.id, tickets.contractId))
      .leftJoin(consumptionRecords, eq(contracts.id, consumptionRecords.contractId))
      .where(eq(contracts.id, id));

    return {
      ...contractDetails,
      activity: {
        totalTickets: Number(activity?.totalTickets || 0),
        openTickets: Number(activity?.openTickets || 0),
        lastTicketDate: activity?.lastTicketDate,
        totalConsumptionRecords: Number(activity?.totalConsumptionRecords || 0),
        lastConsumptionDate: activity?.lastConsumptionDate,
      },
    };
  }

  /**
   * Get expiring contracts (within next 60 days)
   */
  static async getExpiringContracts(organizationId: string): Promise<any[]> {
    const sixtyDaysFromNow = new Date();
    sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

    return await db
      .select({
        contract: contracts,
        building: buildings,
      })
      .from(contracts)
      .leftJoin(buildings, eq(contracts.buildingId, buildings.id))
      .where(
        and(
          eq(contracts.organizationId, organizationId),
          eq(contracts.isActive, true),
          lte(contracts.endDate, sixtyDaysFromNow),
          gte(contracts.endDate, new Date())
        )
      )
      .orderBy(asc(contracts.endDate));
  }

  /**
   * Check if unit number is available in building
   */
  static async isUnitAvailable(
    buildingId: string,
    unitNumber: string,
    organizationId: string,
    excludeContractId?: string
  ): Promise<boolean> {
    let query = db
      .select({ id: contracts.id })
      .from(contracts)
      .where(
        and(
          eq(contracts.buildingId, buildingId),
          eq(contracts.unitNumber, unitNumber),
          eq(contracts.organizationId, organizationId),
          eq(contracts.isActive, true)
        )
      );

    if (excludeContractId) {
      query = query.where(ne(contracts.id, excludeContractId));
    }

    const [existing] = await query.limit(1);
    return !existing;
  }

  /**
   * Generate next contract number
   */
  static async generateContractNumber(organizationId: string): Promise<string> {
    const currentYear = new Date().getFullYear();
    const prefix = `TB-${currentYear}`;

    const [lastContract] = await db
      .select({ contractNumber: contracts.contractNumber })
      .from(contracts)
      .where(
        and(
          eq(contracts.organizationId, organizationId),
          sql`${contracts.contractNumber} LIKE ${`${prefix}-%`}`
        )
      )
      .orderBy(desc(contracts.contractNumber))
      .limit(1);

    if (!lastContract) {
      return `${prefix}-001`;
    }

    // Extract number and increment
    const match = lastContract.contractNumber.match(/TB-\d{4}-(\d{3})/);
    if (match) {
      const nextNum = (parseInt(match[1]) + 1).toString().padStart(3, '0');
      return `${prefix}-${nextNum}`;
    }

    return `${prefix}-001`;
  }

  /**
   * Activate/Deactivate contract
   */
  static async toggleActive(
    id: string,
    organizationId: string,
    isActive: boolean
  ): Promise<Contract | null> {
    return await this.update(id, organizationId, { isActive });
  }
}