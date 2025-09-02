// src/lib/db/queries.ts
import { eq, and, or, desc, asc, gte, lte, count, sum, avg, sql, inArray } from 'drizzle-orm';
import { db } from './db';
import { 
  organizations,
  users,
  buildings,
  contracts,
  tenantContracts,
  tickets,
  consumptionRecords,
  documents
} from './schema';

/**
 * Complex queries that join multiple tables and provide rich data
 */
export class QueryBuilder {
  
  /**
   * Get comprehensive dashboard data for landlord admins
   */
  static async getLandlordDashboard(organizationId: string) {
    // Get basic counts
    const [stats] = await db
      .select({
        totalBuildings: count(buildings.id),
        totalContracts: count(contracts.id),
        activeContracts: sum(sql<number>`CASE WHEN ${contracts.isActive} THEN 1 ELSE 0 END`),
        totalTenants: sum(sql<number>`CASE WHEN ${users.role} = 'tenant' AND ${users.isActive} THEN 1 ELSE 0 END`),
        totalTickets: count(tickets.id),
        openTickets: sum(sql<number>`CASE WHEN ${tickets.status} IN ('open', 'in_progress') THEN 1 ELSE 0 END`),
        urgentTickets: sum(sql<number>`CASE WHEN ${tickets.priority} = 'urgent' AND ${tickets.status} NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END`),
      })
      .from(organizations)
      .leftJoin(buildings, eq(organizations.id, buildings.organizationId))
      .leftJoin(contracts, eq(organizations.id, contracts.organizationId))
      .leftJoin(users, eq(organizations.id, users.organizationId))
      .leftJoin(tickets, eq(organizations.id, tickets.organizationId))
      .where(eq(organizations.id, organizationId));

    // Get recent tickets
    const recentTickets = await db
      .select({
        ticket: tickets,
        building: buildings,
        contract: contracts,
        createdBy: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(tickets)
      .leftJoin(buildings, eq(tickets.buildingId, buildings.id))
      .leftJoin(contracts, eq(tickets.contractId, contracts.id))
      .leftJoin(users, eq(tickets.createdById, users.id))
      .where(eq(tickets.organizationId, organizationId))
      .orderBy(desc(tickets.createdAt))
      .limit(5);

    // Get buildings with occupancy
    const buildingOccupancy = await db
      .select({
        building: buildings,
        totalUnits: buildings.totalUnits,
        occupiedUnits: count(contracts.id),
        activeContracts: sum(sql<number>`CASE WHEN ${contracts.isActive} THEN 1 ELSE 0 END`),
      })
      .from(buildings)
      .leftJoin(contracts, eq(buildings.id, contracts.buildingId))
      .where(eq(buildings.organizationId, organizationId))
      .groupBy(buildings.id, buildings.name, buildings.totalUnits)
      .orderBy(desc(buildings.createdAt));

    return {
      stats: {
        totalBuildings: Number(stats?.totalBuildings || 0),
        totalContracts: Number(stats?.totalContracts || 0),
        activeContracts: Number(stats?.activeContracts || 0),
        totalTenants: Number(stats?.totalTenants || 0),
        totalTickets: Number(stats?.totalTickets || 0),
        openTickets: Number(stats?.openTickets || 0),
        urgentTickets: Number(stats?.urgentTickets || 0),
      },
      recentTickets,
      buildingOccupancy: buildingOccupancy.map(b => ({
        ...b.building,
        occupancy: {
          total: b.totalUnits,
          occupied: Number(b.activeContracts || 0),
          rate: b.totalUnits > 0 ? Math.round((Number(b.activeContracts || 0) / b.totalUnits) * 100) : 0,
        },
      })),
    };
  }

  /**
   * Get comprehensive dashboard data for tenants
   */
  static async getTenantDashboard(tenantId: string, organizationId: string) {
    // Get tenant's contracts with building info
    const contracts = await db
      .select({
        tenantContract: tenantContracts,
        contract: contracts,
        building: buildings,
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
      .orderBy(desc(tenantContracts.isMainTenant));

    // Get ticket stats
    const [ticketStats] = await db
      .select({
        total: count(tickets.id),
        open: sum(sql<number>`CASE WHEN ${tickets.status} = 'open' THEN 1 ELSE 0 END`),
        inProgress: sum(sql<number>`CASE WHEN ${tickets.status} = 'in_progress' THEN 1 ELSE 0 END`),
        resolved: sum(sql<number>`CASE WHEN ${tickets.status} = 'resolved' THEN 1 ELSE 0 END`),
      })
      .from(tickets)
      .where(eq(tickets.createdById, tenantId));

    // Get recent tickets
    const recentTickets = await db
      .select({
        ticket: tickets,
        building: buildings,
        contract: contracts,
      })
      .from(tickets)
      .leftJoin(buildings, eq(tickets.buildingId, buildings.id))
      .leftJoin(contracts, eq(tickets.contractId, contracts.id))
      .where(eq(tickets.createdById, tenantId))
      .orderBy(desc(tickets.createdAt))
      .limit(5);

    // Get latest consumption data
    const contractIds = contracts.map(c => c.contract?.id).filter(Boolean) as string[];
    let latestConsumption: any[] = [];

    if (contractIds.length > 0) {
      latestConsumption = await db
        .select({
          record: consumptionRecords,
          contract: contracts,
        })
        .from(consumptionRecords)
        .leftJoin(contracts, eq(consumptionRecords.contractId, contracts.id))
        .where(inArray(consumptionRecords.contractId, contractIds))
        .orderBy(desc(consumptionRecords.readingDate))
        .limit(10);
    }

    return {
      contracts,
      ticketStats: {
        total: Number(ticketStats?.total || 0),
        open: Number(ticketStats?.open || 0),
        inProgress: Number(ticketStats?.inProgress || 0),
        resolved: Number(ticketStats?.resolved || 0),
      },
      recentTickets,
      latestConsumption,
    };
  }

  /**
   * Get building overview with all related data
   */
  static async getBuildingOverview(buildingId: string, organizationId: string) {
    // Get building with basic stats
    const [buildingData] = await db
      .select({
        building: buildings,
        totalContracts: count(contracts.id),
        activeContracts: sum(sql<number>`CASE WHEN ${contracts.isActive} THEN 1 ELSE 0 END`),
        totalTickets: count(tickets.id),
        openTickets: sum(sql<number>`CASE WHEN ${tickets.status} IN ('open', 'in_progress') THEN 1 ELSE 0 END`),
      })
      .from(buildings)
      .leftJoin(contracts, eq(buildings.id, contracts.buildingId))
      .leftJoin(tickets, eq(buildings.id, tickets.buildingId))
      .where(
        and(
          eq(buildings.id, buildingId),
          eq(buildings.organizationId, organizationId)
        )
      )
      .groupBy(buildings.id);

    if (!buildingData) return null;

    // Get all contracts with tenant info
    const contractsWithTenants = await db
      .select({
        contract: contracts,
        tenants: sql<any[]>`
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', ${users.id},
              'name', ${users.name},
              'email', ${users.email},
              'percentage', ${tenantContracts.percentage},
              'isMainTenant', ${tenantContracts.isMainTenant}
            )
          ) FILTER (WHERE ${users.id} IS NOT NULL)
        `,
      })
      .from(contracts)
      .leftJoin(tenantContracts, eq(contracts.id, tenantContracts.contractId))
      .leftJoin(users, eq(tenantContracts.tenantId, users.id))
      .where(eq(contracts.buildingId, buildingId))
      .groupBy(contracts.id)
      .orderBy(contracts.unitNumber);

    // Get recent tickets for this building
    const recentTickets = await db
      .select({
        ticket: tickets,
        contract: contracts,
        createdBy: {
          id: users.id,
          name: users.name,
        },
      })
      .from(tickets)
      .leftJoin(contracts, eq(tickets.contractId, contracts.id))
      .leftJoin(users, eq(tickets.createdById, users.id))
      .where(eq(tickets.buildingId, buildingId))
      .orderBy(desc(tickets.createdAt))
      .limit(10);

    return {
      building: buildingData.building,
      stats: {
        totalContracts: Number(buildingData.totalContracts || 0),
        activeContracts: Number(buildingData.activeContracts || 0),
        totalTickets: Number(buildingData.totalTickets || 0),
        openTickets: Number(buildingData.openTickets || 0),
        occupancyRate: buildingData.building.totalUnits > 0 
          ? Math.round((Number(buildingData.activeContracts || 0) / buildingData.building.totalUnits) * 100)
          : 0,
      },
      contracts: contractsWithTenants,
      recentTickets,
    };
  }

  /**
   * Get organization analytics
   */
  static async getOrganizationAnalytics(
    organizationId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
    } = {}
  ) {
    const { startDate, endDate } = options;

    let dateConditions = sql`TRUE`;
    if (startDate && endDate) {
      dateConditions = and(
        gte(tickets.createdAt, startDate),
        lte(tickets.createdAt, endDate)
      );
    }

    // Ticket analytics by month
    const ticketsByMonth = await db
      .select({
        month: sql<string>`TO_CHAR(${tickets.createdAt}, 'YYYY-MM')`,
        total: count(tickets.id),
        urgent: sum(sql<number>`CASE WHEN ${tickets.priority} = 'urgent' THEN 1 ELSE 0 END`),
        resolved: sum(sql<number>`CASE WHEN ${tickets.status} = 'resolved' THEN 1 ELSE 0 END`),
      })
      .from(tickets)
      .where(
        and(
          eq(tickets.organizationId, organizationId),
          dateConditions
        )
      )
      .groupBy(sql`TO_CHAR(${tickets.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${tickets.createdAt}, 'YYYY-MM')`);

    // Consumption trends
    const consumptionTrends = await db
      .select({
        period: consumptionRecords.period,
        consumptionType: consumptionRecords.consumptionType,
        totalReading: sum(consumptionRecords.reading),
        totalCost: sum(consumptionRecords.cost),
        avgReading: avg(consumptionRecords.reading),
      })
      .from(consumptionRecords)
      .where(eq(consumptionRecords.organizationId, organizationId))
      .groupBy(consumptionRecords.period, consumptionRecords.consumptionType)
      .orderBy(asc(consumptionRecords.period));

    // Building performance
    const buildingPerformance = await db
      .select({
        building: buildings,
        occupancyRate: sql<number>`
          CASE 
            WHEN ${buildings.totalUnits} > 0 
            THEN ROUND((COUNT(CASE WHEN ${contracts.isActive} THEN 1 END) * 100.0) / ${buildings.totalUnits}, 2)
            ELSE 0
          END
        `,
        totalRevenue: sum(sql<number>`CASE WHEN ${contracts.isActive} THEN ${contracts.rentAmount} ELSE 0 END`),
        openTickets: sum(sql<number>`CASE WHEN ${tickets.status} IN ('open', 'in_progress') THEN 1 ELSE 0 END`),
        avgTicketResolutionDays: sql<number>`
          AVG(
            CASE 
              WHEN ${tickets.resolvedAt} IS NOT NULL 
              THEN EXTRACT(DAY FROM ${tickets.resolvedAt} - ${tickets.createdAt})
              ELSE NULL
            END
          )
        `,
      })
      .from(buildings)
      .leftJoin(contracts, eq(buildings.id, contracts.buildingId))
      .leftJoin(tickets, eq(buildings.id, tickets.buildingId))
      .where(eq(buildings.organizationId, organizationId))
      .groupBy(buildings.id, buildings.name, buildings.totalUnits)
      .orderBy(desc(sql`COUNT(CASE WHEN ${contracts.isActive} THEN 1 END)`));

    return {
      ticketsByMonth: ticketsByMonth.map(t => ({
        month: t.month,
        total: Number(t.total),
        urgent: Number(t.urgent || 0),
        resolved: Number(t.resolved || 0),
      })),
      consumptionTrends: consumptionTrends.map(c => ({
        period: c.period,
        consumptionType: c.consumptionType,
        totalReading: Number(c.totalReading || 0),
        totalCost: Number(c.totalCost || 0),
        avgReading: Number(c.avgReading || 0),
      })),
      buildingPerformance: buildingPerformance.map(b => ({
        building: b.building,
        occupancyRate: Number(b.occupancyRate || 0),
        totalRevenue: Number(b.totalRevenue || 0),
        openTickets: Number(b.openTickets || 0),
        avgTicketResolutionDays: Number(b.avgTicketResolutionDays || 0),
      })),
    };
  }

  /**
   * Get tenant consumption summary
   */
  static async getTenantConsumptionSummary(
    tenantId: string,
    organizationId: string,
    options: {
      startPeriod?: string;
      endPeriod?: string;
    } = {}
  ) {
    const { startPeriod, endPeriod } = options;

    // Get tenant's contracts
    const tenantContractIds = await db
      .select({ contractId: tenantContracts.contractId })
      .from(tenantContracts)
      .where(
        and(
          eq(tenantContracts.tenantId, tenantId),
          eq(tenantContracts.organizationId, organizationId)
        )
      );

    const contractIds = tenantContractIds.map(tc => tc.contractId);
    if (contractIds.length === 0) return null;

    let whereConditions = inArray(consumptionRecords.contractId, contractIds);

    if (startPeriod) {
      whereConditions = and(whereConditions, gte(consumptionRecords.period, startPeriod));
    }
    if (endPeriod) {
      whereConditions = and(whereConditions, lte(consumptionRecords.period, endPeriod));
    }

    // Get consumption by type and period
    const consumptionData = await db
      .select({
        period: consumptionRecords.period,
        consumptionType: consumptionRecords.consumptionType,
        totalReading: sum(consumptionRecords.reading),
        totalCost: sum(consumptionRecords.cost),
        contractId: consumptionRecords.contractId,
        unitNumber: contracts.unitNumber,
        buildingName: buildings.name,
      })
      .from(consumptionRecords)
      .leftJoin(contracts, eq(consumptionRecords.contractId, contracts.id))
      .leftJoin(buildings, eq(contracts.buildingId, buildings.id))
      .where(whereConditions)
      .groupBy(
        consumptionRecords.period,
        consumptionRecords.consumptionType,
        consumptionRecords.contractId,
        contracts.unitNumber,
        buildings.name
      )
      .orderBy(desc(consumptionRecords.period));

    // Get summary stats
    const [summary] = await db
      .select({
        totalCost: sum(consumptionRecords.cost),
        totalReading: sum(consumptionRecords.reading),
        avgMonthlyCost: avg(consumptionRecords.cost),
        recordCount: count(consumptionRecords.id),
      })
      .from(consumptionRecords)
      .where(whereConditions);

    return {
      summary: {
        totalCost: Number(summary?.totalCost || 0),
        totalReading: Number(summary?.totalReading || 0),
        avgMonthlyCost: Number(summary?.avgMonthlyCost || 0),
        recordCount: Number(summary?.recordCount || 0),
      },
      consumptionData: consumptionData.map(c => ({
        period: c.period,
        consumptionType: c.consumptionType,
        totalReading: Number(c.totalReading || 0),
        totalCost: Number(c.totalCost || 0),
        contractId: c.contractId,
        unitNumber: c.unitNumber,
        buildingName: c.buildingName,
      })),
    };
  }

  /**
   * Get contract financial summary
   */
  static async getContractFinancials(
    contractId: string,
    organizationId: string,
    options: {
      startPeriod?: string;
      endPeriod?: string;
    } = {}
  ) {
    const { startPeriod, endPeriod } = options;

    // Get contract details
    const [contractData] = await db
      .select({
        contract: contracts,
        building: buildings,
      })
      .from(contracts)
      .leftJoin(buildings, eq(contracts.buildingId, buildings.id))
      .where(
        and(
          eq(contracts.id, contractId),
          eq(contracts.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!contractData) return null;

    let whereConditions = eq(consumptionRecords.contractId, contractId);

    if (startPeriod) {
      whereConditions = and(whereConditions, gte(consumptionRecords.period, startPeriod));
    }
    if (endPeriod) {
      whereConditions = and(whereConditions, lte(consumptionRecords.period, endPeriod));
    }

    // Get consumption costs by type
    const consumptionByType = await db
      .select({
        consumptionType: consumptionRecords.consumptionType,
        totalCost: sum(consumptionRecords.cost),
        totalReading: sum(consumptionRecords.reading),
        avgCost: avg(consumptionRecords.cost),
        recordCount: count(consumptionRecords.id),
      })
      .from(consumptionRecords)
      .where(whereConditions)
      .groupBy(consumptionRecords.consumptionType)
      .orderBy(desc(sum(consumptionRecords.cost)));

    // Get monthly breakdown
    const monthlyBreakdown = await db
      .select({
        period: consumptionRecords.period,
        totalCost: sum(consumptionRecords.cost),
        totalReading: sum(consumptionRecords.reading),
      })
      .from(consumptionRecords)
      .where(whereConditions)
      .groupBy(consumptionRecords.period)
      .orderBy(asc(consumptionRecords.period));

    // Get ticket costs
    const [ticketCosts] = await db
      .select({
        estimatedCost: sum(tickets.estimatedCost),
        actualCost: sum(tickets.actualCost),
        ticketCount: count(tickets.id),
      })
      .from(tickets)
      .where(eq(tickets.contractId, contractId));

    const monthlyRent = Number(contractData.contract.rentAmount || 0);
    const totalConsumptionCost = Number(consumptionByType.reduce((sum, c) => sum + Number(c.totalCost || 0), 0));
    const totalTicketCost = Number(ticketCosts?.actualCost || 0);

    return {
      contract: contractData.contract,
      building: contractData.building,
      financial: {
        monthlyRent,
        totalConsumptionCost,
        totalTicketCost,
        totalOperationalCost: totalConsumptionCost + totalTicketCost,
      },
      consumptionByType: consumptionByType.map(c => ({
        consumptionType: c.consumptionType,
        totalCost: Number(c.totalCost || 0),
        totalReading: Number(c.totalReading || 0),
        avgCost: Number(c.avgCost || 0),
        recordCount: Number(c.recordCount || 0),
      })),
      monthlyBreakdown: monthlyBreakdown.map(m => ({
        period: m.period,
        totalCost: Number(m.totalCost || 0),
        totalReading: Number(m.totalReading || 0),
      })),
      ticketCosts: {
        estimated: Number(ticketCosts?.estimatedCost || 0),
        actual: Number(ticketCosts?.actualCost || 0),
        count: Number(ticketCosts?.ticketCount || 0),
      },
    };
  }

  /**
   * Search across all entities
   */
  static async globalSearch(
    organizationId: string,
    searchTerm: string,
    options: { limit?: number } = {}
  ) {
    const { limit = 5 } = options;

    // Search buildings
    const buildingResults = await db
      .select({
        id: buildings.id,
        name: buildings.name,
        type: sql<string>`'building'`,
        description: buildings.address,
      })
      .from(buildings)
      .where(
        and(
          eq(buildings.organizationId, organizationId),
          or(
            like(buildings.name, `%${searchTerm}%`),
            like(buildings.address, `%${searchTerm}%`)
          )
        )
      )
      .limit(limit);

    // Search contracts
    const contractResults = await db
      .select({
        id: contracts.id,
        name: sql<string>`${contracts.contractNumber} || ' - ' || ${contracts.unitNumber}`,
        type: sql<string>`'contract'`,
        description: buildings.name,
      })
      .from(contracts)
      .leftJoin(buildings, eq(contracts.buildingId, buildings.id))
      .where(
        and(
          eq(contracts.organizationId, organizationId),
          or(
            like(contracts.contractNumber, `%${searchTerm}%`),
            like(contracts.unitNumber, `%${searchTerm}%`)
          )
        )
      )
      .limit(limit);

    // Search tickets
    const ticketResults = await db
      .select({
        id: tickets.id,
        name: tickets.title,
        type: sql<string>`'ticket'`,
        description: sql<string>`${tickets.status} || ' - ' || ${buildings.name}`,
      })
      .from(tickets)
      .leftJoin(buildings, eq(tickets.buildingId, buildings.id))
      .where(
        and(
          eq(tickets.organizationId, organizationId),
          or(
            like(tickets.title, `%${searchTerm}%`),
            like(tickets.description, `%${searchTerm}%`)
          )
        )
      )
      .limit(limit);

    // Search users
    const userResults = await db
      .select({
        id: users.id,
        name: users.name,
        type: sql<string>`'user'`,
        description: sql<string>`${users.email} || ' - ' || ${users.role}`,
      })
      .from(users)
      .where(
        and(
          eq(users.organizationId, organizationId),
          or(
            like(users.name, `%${searchTerm}%`),
            like(users.email, `%${searchTerm}%`)
          )
        )
      )
      .limit(limit);

    return {
      buildings: buildingResults,
      contracts: contractResults,
      tickets: ticketResults,
      users: userResults,
    };
  }
}