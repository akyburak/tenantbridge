// src/lib/db/services/users.ts
import { eq, and, or, ne, desc, count, like, sum, sql, inArray } from 'drizzle-orm';
import { db } from '../db';
import { 
  users, 
  organizations,
  tenantContracts,
  contracts,
  buildings,
  tickets,
  type User, 
  type NewUser 
} from '../schema';

export class UserService {
  /**
   * Create a new user
   */
  static async create(data: Omit<NewUser, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(data)
      .returning();

    return user;
  }

  /**
   * Get user by ID with organization check
   */
  static async getById(id: string, organizationId: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, id),
          eq(users.organizationId, organizationId)
        )
      )
      .limit(1);

    return user || null;
  }

  /**
   * Get user by email
   */
  static async getByEmail(email: string): Promise<any | null> {
    const [userData] = await db
      .select({
        user: users,
        organization: organizations,
      })
      .from(users)
      .leftJoin(organizations, eq(users.organizationId, organizations.id))
      .where(eq(users.email, email))
      .limit(1);

    return userData || null;
  }

  /**
   * Get users by organization with filtering
   */
  static async getByOrganization(
    organizationId: string,
    options: {
      role?: string;
      isActive?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const { role, isActive, limit = 50, offset = 0 } = options;

    let whereConditions = eq(users.organizationId, organizationId);

    if (role) {
      whereConditions = and(whereConditions, eq(users.role, role));
    }
    if (isActive !== undefined) {
      whereConditions = and(whereConditions, eq(users.isActive, isActive));
    }

    return await db
      .select()
      .from(users)
      .where(whereConditions)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get tenant with contracts
   */
  static async getTenantWithContracts(tenantId: string, organizationId: string) {
    const [tenant] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, tenantId),
          eq(users.organizationId, organizationId),
          eq(users.role, 'tenant')
        )
      )
      .limit(1);

    if (!tenant) return null;

    // Get tenant's contracts
    const tenantContractsList = await db
      .select({
        tenantContract: tenantContracts,
        contract: contracts,
        building: buildings,
      })
      .from(tenantContracts)
      .leftJoin(contracts, eq(tenantContracts.contractId, contracts.id))
      .leftJoin(buildings, eq(contracts.buildingId, buildings.id))
      .where(eq(tenantContracts.tenantId, tenantId))
      .orderBy(desc(tenantContracts.isMainTenant), desc(tenantContracts.createdAt));

    // Get tenant's recent activity
    const [activity] = await db
      .select({
        totalTickets: count(tickets.id),
        openTickets: sum(
          sql<number>`CASE WHEN ${tickets.status} IN ('open', 'in_progress') THEN 1 ELSE 0 END`
        ),
        lastTicketDate: sql<Date>`MAX(${tickets.createdAt})`,
      })
      .from(tickets)
      .where(eq(tickets.createdById, tenantId));

    return {
      ...tenant,
      contracts: tenantContractsList,
      activity: {
        totalTickets: Number(activity?.totalTickets || 0),
        openTickets: Number(activity?.openTickets || 0),
        lastTicketDate: activity?.lastTicketDate,
      },
    };
  }

  /**
   * Update user
   */
  static async update(
    id: string,
    organizationId: string,
    data: Partial<Omit<User, 'id' | 'organizationId' | 'createdAt'>>
  ): Promise<User | null> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(users.id, id),
          eq(users.organizationId, organizationId)
        )
      )
      .returning();

    return user || null;
  }

  /**
   * Deactivate user (soft delete)
   */
  static async deactivate(id: string, organizationId: string): Promise<boolean> {
    const updated = await this.update(id, organizationId, { isActive: false });
    return !!updated;
  }

  /**
   * Reactivate user
   */
  static async reactivate(id: string, organizationId: string): Promise<boolean> {
    const updated = await this.update(id, organizationId, { isActive: true });
    return !!updated;
  }

  /**
   * Search users
   */
  static async search(
    organizationId: string,
    searchTerm: string,
    options: { role?: string; limit?: number } = {}
  ) {
    const { role, limit = 20 } = options;

    let whereConditions = and(
      eq(users.organizationId, organizationId),
      or(
        like(users.name, `%${searchTerm}%`),
        like(users.email, `%${searchTerm}%`)
      )
    );

    if (role) {
      whereConditions = and(whereConditions, eq(users.role, role));
    }

    return await db
      .select()
      .from(users)
      .where(whereConditions)
      .orderBy(desc(users.name))
      .limit(limit);
  }

  /**
   * Get users stats for organization
   */
  static async getStats(organizationId: string) {
    const [stats] = await db
      .select({
        total: count(users.id),
        landlordAdmins: sum(sql<number>`CASE WHEN ${users.role} = 'landlord_admin' THEN 1 ELSE 0 END`),
        tenants: sum(sql<number>`CASE WHEN ${users.role} = 'tenant' THEN 1 ELSE 0 END`),
        active: sum(sql<number>`CASE WHEN ${users.isActive} THEN 1 ELSE 0 END`),
        inactive: sum(sql<number>`CASE WHEN NOT ${users.isActive} THEN 1 ELSE 0 END`),
      })
      .from(users)
      .where(eq(users.organizationId, organizationId));

    return {
      total: Number(stats?.total || 0),
      landlordAdmins: Number(stats?.landlordAdmins || 0),
      tenants: Number(stats?.tenants || 0),
      active: Number(stats?.active || 0),
      inactive: Number(stats?.inactive || 0),
    };
  }

  /**
   * Get available tenants (not assigned to a specific contract)
   */
  static async getAvailableTenants(
    organizationId: string,
    excludeContractId?: string
  ) {
    // Get all tenants in the organization
    const allTenants = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.organizationId, organizationId),
          eq(users.role, 'tenant'),
          eq(users.isActive, true)
        )
      );

    if (!excludeContractId) {
      return allTenants;
    }

    // Get tenants already assigned to the contract
    const assignedTenants = await db
      .select({ tenantId: tenantContracts.tenantId })
      .from(tenantContracts)
      .where(eq(tenantContracts.contractId, excludeContractId));

    const assignedIds = assignedTenants.map(t => t.tenantId);

    // Return tenants not assigned to this contract
    return allTenants.filter(tenant => !assignedIds.includes(tenant.id));
  }

  /**
   * Check if email is available
   */
  static async isEmailAvailable(email: string, excludeUserId?: string): Promise<boolean> {
    let query = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));

    if (excludeUserId) {
      query = query.where(ne(users.id, excludeUserId));
    }

    const [existing] = await query.limit(1);
    return !existing;
  }

  /**
   * Get user's dashboard data
   */
  static async getDashboardData(userId: string, organizationId: string) {
    const user = await this.getById(userId, organizationId);
    if (!user) return null;

    if (user.role === 'tenant') {
      // Get tenant-specific dashboard data
      const contracts = await db
        .select({
          tenantContract: tenantContracts,
          contract: contracts,
          building: buildings,
        })
        .from(tenantContracts)
        .leftJoin(contracts, eq(tenantContracts.contractId, contracts.id))
        .leftJoin(buildings, eq(contracts.buildingId, buildings.id))
        .where(eq(tenantContracts.tenantId, userId));

      const [ticketStats] = await db
        .select({
          total: count(tickets.id),
          open: sum(sql<number>`CASE WHEN ${tickets.status} = 'open' THEN 1 ELSE 0 END`),
          inProgress: sum(sql<number>`CASE WHEN ${tickets.status} = 'in_progress' THEN 1 ELSE 0 END`),
        })
        .from(tickets)
        .where(eq(tickets.createdById, userId));

      return {
        user,
        contracts,
        ticketStats: {
          total: Number(ticketStats?.total || 0),
          open: Number(ticketStats?.open || 0),
          inProgress: Number(ticketStats?.inProgress || 0),
        },
      };
    } else {
      // Landlord admin dashboard data
      const [orgStats] = await db
        .select({
          totalBuildings: count(buildings.id),
          totalContracts: count(contracts.id),
          totalTenants: sum(sql<number>`CASE WHEN ${users.role} = 'tenant' THEN 1 ELSE 0 END`),
        })
        .from(users)
        .leftJoin(buildings, eq(users.organizationId, buildings.organizationId))
        .leftJoin(contracts, eq(users.organizationId, contracts.organizationId))
        .where(eq(users.organizationId, organizationId));

      return {
        user,
        stats: {
          totalBuildings: Number(orgStats?.totalBuildings || 0),
          totalContracts: Number(orgStats?.totalContracts || 0),
          totalTenants: Number(orgStats?.totalTenants || 0),
        },
      };
    }
  }
}