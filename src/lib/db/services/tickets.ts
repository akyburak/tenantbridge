// src/lib/db/services/tickets.ts
import { eq, and, or, desc, asc, gte, lte, count, like, sql, inArray } from 'drizzle-orm';
import { db } from '../db';
import { 
  tickets, 
  buildings,
  contracts,
  users,
  documents,
  tenantContracts,
  type Ticket, 
  type NewTicket 
} from '../schema';

export class TicketService {
  /**
   * Create a new ticket
   */
  static async create(data: Omit<NewTicket, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ticket> {
    const [ticket] = await db
      .insert(tickets)
      .values(data)
      .returning();

    return ticket;
  }

  /**
   * Get ticket by ID with access control
   */
  static async getById(
    id: string, 
    organizationId: string, 
    userId?: string,
    userRole?: string
  ): Promise<any | null> {
    let whereConditions = and(
      eq(tickets.id, id),
      eq(tickets.organizationId, organizationId)
    );

    // If tenant, can only see their own tickets or tickets for their contracts
    if (userRole === 'tenant' && userId) {
      const tenantContractIds = await db
        .select({ contractId: tenantContracts.contractId })
        .from(tenantContracts)
        .where(eq(tenantContracts.tenantId, userId));

      const contractIds = tenantContractIds.map(tc => tc.contractId);

      whereConditions = and(
        whereConditions,
        or(
          eq(tickets.createdById, userId),
          contractIds.length > 0 ? inArray(tickets.contractId, contractIds) : sql`FALSE`
        )
      );
    }

    const [ticketData] = await db
      .select({
        ticket: tickets,
        building: buildings,
        contract: contracts,
        createdBy: {
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
        },
        assignedTo: {
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
        },
      })
      .from(tickets)
      .leftJoin(buildings, eq(tickets.buildingId, buildings.id))
      .leftJoin(contracts, eq(tickets.contractId, contracts.id))
      .leftJoin(users, eq(tickets.createdById, users.id))
      .leftJoin(users, eq(tickets.assignedToId, users.id))
      .where(whereConditions)
      .limit(1);

    return ticketData || null;
  }

  /**
   * Get tickets for an organization with filtering
   */
  static async getByOrganization(
    organizationId: string,
    options: {
      status?: string;
      priority?: string;
      category?: string;
      buildingId?: string;
      contractId?: string;
      createdById?: string;
      assignedToId?: string;
      userRole?: string;
      userId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const { 
      status, 
      priority, 
      category, 
      buildingId, 
      contractId, 
      createdById, 
      assignedToId,
      userRole,
      userId,
      limit = 50, 
      offset = 0 
    } = options;

    let whereConditions = eq(tickets.organizationId, organizationId);

    // Apply filters
    if (status) {
      whereConditions = and(whereConditions, eq(tickets.status, status));
    }
    if (priority) {
      whereConditions = and(whereConditions, eq(tickets.priority, priority));
    }
    if (category) {
      whereConditions = and(whereConditions, eq(tickets.category, category));
    }
    if (buildingId) {
      whereConditions = and(whereConditions, eq(tickets.buildingId, buildingId));
    }
    if (contractId) {
      whereConditions = and(whereConditions, eq(tickets.contractId, contractId));
    }
    if (createdById) {
      whereConditions = and(whereConditions, eq(tickets.createdById, createdById));
    }
    if (assignedToId) {
      whereConditions = and(whereConditions, eq(tickets.assignedToId, assignedToId));
    }

    // Tenant access control - can only see their own tickets or tickets for their contracts
    if (userRole === 'tenant' && userId) {
      const tenantContractIds = await db
        .select({ contractId: tenantContracts.contractId })
        .from(tenantContracts)
        .where(eq(tenantContracts.tenantId, userId));

      const contractIds = tenantContractIds.map(tc => tc.contractId);

      whereConditions = and(
        whereConditions,
        or(
          eq(tickets.createdById, userId),
          contractIds.length > 0 ? inArray(tickets.contractId, contractIds) : sql`FALSE`
        )
      );
    }

    return await db
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
      .where(whereConditions)
      .orderBy(desc(tickets.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Update ticket
   */
  static async update(
    id: string,
    organizationId: string,
    data: Partial<Omit<Ticket, 'id' | 'organizationId' | 'createdAt'>>,
    userId?: string,
    userRole?: string
  ): Promise<Ticket | null> {
    // Check access permissions
    const ticket = await this.getById(id, organizationId, userId, userRole);
    if (!ticket) return null;

    // Tenants can only update their own tickets and only certain fields
    if (userRole === 'tenant' && userId) {
      if (ticket.ticket.createdById !== userId) return null;
      
      // Tenants can only update description and add comments
      const allowedFields = ['description'];
      data = Object.fromEntries(
        Object.entries(data).filter(([key]) => allowedFields.includes(key))
      );
    }

    const [updatedTicket] = await db
      .update(tickets)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(tickets.id, id),
          eq(tickets.organizationId, organizationId)
        )
      )
      .returning();

    return updatedTicket || null;
  }

  /**
   * Assign ticket to user
   */
  static async assign(
    id: string,
    organizationId: string,
    assignedToId: string | null
  ): Promise<Ticket | null> {
    return await this.update(id, organizationId, { 
      assignedToId,
      status: assignedToId ? 'in_progress' : 'open'
    });
  }

  /**
   * Update ticket status
   */
  static async updateStatus(
    id: string,
    organizationId: string,
    status: string,
    resolvedAt?: Date
  ): Promise<Ticket | null> {
    const updateData: any = { status };
    
    if (status === 'resolved' || status === 'closed') {
      updateData.resolvedAt = resolvedAt || new Date();
    }

    return await this.update(id, organizationId, updateData);
  }

  /**
   * Get tickets dashboard stats
   */
  static async getStats(
    organizationId: string,
    options: { userId?: string; userRole?: string } = {}
  ) {
    const { userId, userRole } = options;

    let whereConditions = eq(tickets.organizationId, organizationId);

    // Apply tenant filtering if needed
    if (userRole === 'tenant' && userId) {
      const tenantContractIds = await db
        .select({ contractId: tenantContracts.contractId })
        .from(tenantContracts)
        .where(eq(tenantContracts.tenantId, userId));

      const contractIds = tenantContractIds.map(tc => tc.contractId);

      whereConditions = and(
        whereConditions,
        or(
          eq(tickets.createdById, userId),
          contractIds.length > 0 ? inArray(tickets.contractId, contractIds) : sql`FALSE`
        )
      );
    }

    const [stats] = await db
      .select({
        total: count(tickets.id),
        open: sum(sql<number>`CASE WHEN ${tickets.status} = 'open' THEN 1 ELSE 0 END`),
        inProgress: sum(sql<number>`CASE WHEN ${tickets.status} = 'in_progress' THEN 1 ELSE 0 END`),
        resolved: sum(sql<number>`CASE WHEN ${tickets.status} = 'resolved' THEN 1 ELSE 0 END`),
        urgent: sum(sql<number>`CASE WHEN ${tickets.priority} = 'urgent' THEN 1 ELSE 0 END`),
        high: sum(sql<number>`CASE WHEN ${tickets.priority} = 'high' THEN 1 ELSE 0 END`),
        overdue: sum(
          sql<number>`CASE WHEN ${tickets.dueDate} < NOW() AND ${tickets.status} NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END`
        ),
      })
      .from(tickets)
      .where(whereConditions);

    return {
      total: Number(stats?.total || 0),
      open: Number(stats?.open || 0),
      inProgress: Number(stats?.inProgress || 0),
      resolved: Number(stats?.resolved || 0),
      urgent: Number(stats?.urgent || 0),
      high: Number(stats?.high || 0),
      overdue: Number(stats?.overdue || 0),
    };
  }

  /**
   * Search tickets
   */
  static async search(
    organizationId: string,
    searchTerm: string,
    options: { userId?: string; userRole?: string; limit?: number } = {}
  ) {
    const { userId, userRole, limit = 20 } = options;

    let whereConditions = and(
      eq(tickets.organizationId, organizationId),
      or(
        like(tickets.title, `%${searchTerm}%`),
        like(tickets.description, `%${searchTerm}%`)
      )
    );

    // Apply tenant filtering
    if (userRole === 'tenant' && userId) {
      const tenantContractIds = await db
        .select({ contractId: tenantContracts.contractId })
        .from(tenantContracts)
        .where(eq(tenantContracts.tenantId, userId));

      const contractIds = tenantContractIds.map(tc => tc.contractId);

      whereConditions = and(
        whereConditions,
        or(
          eq(tickets.createdById, userId),
          contractIds.length > 0 ? inArray(tickets.contractId, contractIds) : sql`FALSE`
        )
      );
    }

    return await db
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
      .where(whereConditions)
      .orderBy(desc(tickets.createdAt))
      .limit(limit);
  }
}