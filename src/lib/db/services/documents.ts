// src/lib/db/services/documents.ts
import { eq, and, or, desc, count, like, sql, inArray } from 'drizzle-orm';
import { db } from '../db';
import { 
  documents,
  buildings,
  contracts,
  tickets,
  users,
  tenantContracts,
  type Document, 
  type NewDocument 
} from '../schema';

export class DocumentService {
  /**
   * Create a new document record
   */
  static async create(data: Omit<NewDocument, 'id' | 'createdAt'>): Promise<Document> {
    const [document] = await db
      .insert(documents)
      .values(data)
      .returning();

    return document;
  }

  /**
   * Get document by ID with access control
   */
  static async getById(
    id: string, 
    organizationId: string,
    userId?: string,
    userRole?: string
  ): Promise<any | null> {
    let whereConditions = and(
      eq(documents.id, id),
      eq(documents.organizationId, organizationId)
    );

    // Tenant access control - can only see public docs or docs related to their contracts/tickets
    if (userRole === 'tenant' && userId) {
      const tenantContractIds = await db
        .select({ contractId: tenantContracts.contractId })
        .from(tenantContracts)
        .where(eq(tenantContracts.tenantId, userId));

      const contractIds = tenantContractIds.map(tc => tc.contractId);

      whereConditions = and(
        whereConditions,
        or(
          eq(documents.isPublic, true),
          eq(documents.uploadedById, userId),
          contractIds.length > 0 ? inArray(documents.contractId, contractIds) : sql`FALSE`,
          sql`${documents.ticketId} IN (SELECT id FROM tickets WHERE created_by_id = ${userId})`
        )
      );
    }

    const [documentData] = await db
      .select({
        document: documents,
        building: buildings,
        contract: contracts,
        ticket: tickets,
        uploadedBy: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(documents)
      .leftJoin(buildings, eq(documents.buildingId, buildings.id))
      .leftJoin(contracts, eq(documents.contractId, contracts.id))
      .leftJoin(tickets, eq(documents.ticketId, tickets.id))
      .leftJoin(users, eq(documents.uploadedById, users.id))
      .where(whereConditions)
      .limit(1);

    return documentData || null;
  }

  /**
   * Get documents with filtering
   */
  static async getDocuments(
    organizationId: string,
    options: {
      category?: string;
      buildingId?: string;
      contractId?: string;
      ticketId?: string;
      isPublic?: boolean;
      userId?: string;
      userRole?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const {
      category,
      buildingId,
      contractId,
      ticketId,
      isPublic,
      userId,
      userRole,
      limit = 50,
      offset = 0
    } = options;

    let whereConditions = eq(documents.organizationId, organizationId);

    // Apply filters
    if (category) {
      whereConditions = and(whereConditions, eq(documents.category, category));
    }
    if (buildingId) {
      whereConditions = and(whereConditions, eq(documents.buildingId, buildingId));
    }
    if (contractId) {
      whereConditions = and(whereConditions, eq(documents.contractId, contractId));
    }
    if (ticketId) {
      whereConditions = and(whereConditions, eq(documents.ticketId, ticketId));
    }
    if (isPublic !== undefined) {
      whereConditions = and(whereConditions, eq(documents.isPublic, isPublic));
    }

    // Tenant access control
    if (userRole === 'tenant' && userId) {
      const tenantContractIds = await db
        .select({ contractId: tenantContracts.contractId })
        .from(tenantContracts)
        .where(eq(tenantContracts.tenantId, userId));

      const contractIds = tenantContractIds.map(tc => tc.contractId);

      whereConditions = and(
        whereConditions,
        or(
          eq(documents.isPublic, true),
          eq(documents.uploadedById, userId),
          contractIds.length > 0 ? inArray(documents.contractId, contractIds) : sql`FALSE`,
          sql`${documents.ticketId} IN (SELECT id FROM tickets WHERE created_by_id = ${userId})`
        )
      );
    }

    return await db
      .select({
        document: documents,
        building: buildings,
        contract: contracts,
        ticket: tickets,
        uploadedBy: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(documents)
      .leftJoin(buildings, eq(documents.buildingId, buildings.id))
      .leftJoin(contracts, eq(documents.contractId, contracts.id))
      .leftJoin(tickets, eq(documents.ticketId, tickets.id))
      .leftJoin(users, eq(documents.uploadedById, users.id))
      .where(whereConditions)
      .orderBy(desc(documents.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Update document
   */
  static async update(
    id: string,
    organizationId: string,
    data: Partial<Omit<Document, 'id' | 'organizationId' | 'createdAt'>>
  ): Promise<Document | null> {
    const [document] = await db
      .update(documents)
      .set(data)
      .where(
        and(
          eq(documents.id, id),
          eq(documents.organizationId, organizationId)
        )
      )
      .returning();

    return document || null;
  }

  /**
   * Delete document
   */
  static async delete(id: string, organizationId: string): Promise<boolean> {
    try {
      const [deleted] = await db
        .delete(documents)
        .where(
          and(
            eq(documents.id, id),
            eq(documents.organizationId, organizationId)
          )
        )
        .returning();

      return !!deleted;
    } catch (error) {
      console.error('Failed to delete document:', error);
      return false;
    }
  }

  /**
   * Get documents by category
   */
  static async getByCategory(
    organizationId: string,
    category: string,
    options: { userId?: string; userRole?: string } = {}
  ) {
    return await this.getDocuments(organizationId, {
      category,
      ...options,
    });
  }

  /**
   * Search documents
   */
  static async search(
    organizationId: string,
    searchTerm: string,
    options: { userId?: string; userRole?: string; limit?: number } = {}
  ) {
    const { userId, userRole, limit = 20 } = options;

    let whereConditions = and(
      eq(documents.organizationId, organizationId),
      or(
        like(documents.fileName, `%${searchTerm}%`),
        like(documents.originalFileName, `%${searchTerm}%`),
        like(documents.description, `%${searchTerm}%`)
      )
    );

    // Tenant access control
    if (userRole === 'tenant' && userId) {
      const tenantContractIds = await db
        .select({ contractId: tenantContracts.contractId })
        .from(tenantContracts)
        .where(eq(tenantContracts.tenantId, userId));

      const contractIds = tenantContractIds.map(tc => tc.contractId);

      whereConditions = and(
        whereConditions,
        or(
          eq(documents.isPublic, true),
          eq(documents.uploadedById, userId),
          contractIds.length > 0 ? inArray(documents.contractId, contractIds) : sql`FALSE`,
          sql`${documents.ticketId} IN (SELECT id FROM tickets WHERE created_by_id = ${userId})`
        )
      );
    }

    return await db
      .select({
        document: documents,
        building: buildings,
        contract: contracts,
        uploadedBy: {
          id: users.id,
          name: users.name,
        },
      })
      .from(documents)
      .leftJoin(buildings, eq(documents.buildingId, buildings.id))
      .leftJoin(contracts, eq(documents.contractId, contracts.id))
      .leftJoin(users, eq(documents.uploadedById, users.id))
      .where(whereConditions)
      .orderBy(desc(documents.createdAt))
      .limit(limit);
  }

  /**
   * Get storage stats for organization
   */
  static async getStorageStats(organizationId: string) {
    const [stats] = await db
      .select({
        totalFiles: count(documents.id),
        totalSize: sum(documents.fileSize),
        avgSize: sql<number>`AVG(${documents.fileSize})`,
        publicFiles: sum(sql<number>`CASE WHEN ${documents.isPublic} THEN 1 ELSE 0 END`),
        privateFiles: sum(sql<number>`CASE WHEN NOT ${documents.isPublic} THEN 1 ELSE 0 END`),
      })
      .from(documents)
      .where(eq(documents.organizationId, organizationId));

    // Get file type breakdown
    const fileTypes = await db
      .select({
        mimeType: documents.mimeType,
        count: count(documents.id),
        totalSize: sum(documents.fileSize),
      })
      .from(documents)
      .where(eq(documents.organizationId, organizationId))
      .groupBy(documents.mimeType)
      .orderBy(desc(count(documents.id)));

    return {
      summary: {
        totalFiles: Number(stats?.totalFiles || 0),
        totalSize: Number(stats?.totalSize || 0),
        avgSize: Number(stats?.avgSize || 0),
        publicFiles: Number(stats?.publicFiles || 0),
        privateFiles: Number(stats?.privateFiles || 0),
      },
      fileTypes: fileTypes.map(ft => ({
        mimeType: ft.mimeType,
        count: Number(ft.count),
        totalSize: Number(ft.totalSize || 0),
      })),
    };
  }
}