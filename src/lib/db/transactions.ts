// src/lib/db/transactions.ts
import { eq, and, inArray, count, sql } from 'drizzle-orm';
import { db } from './db';
import { setRLSContext, createRLSContext } from './utils';
import { 
  users, 
  tenantContracts, 
  invitationTokens,
  contracts,
  buildings,
  tickets,
  consumptionRecords,
  documents
} from './schema';

/**
 * Execute multiple database operations in a transaction
 */
export async function withTransaction<T>(
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    return await callback(tx);
  });
}

/**
 * Execute transaction with RLS context
 */
export async function withTransactionAndRLS<T>(
  context: {
    organizationId: string;
    userId: string;
    userRole: string;
  },
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    // Set RLS context for the transaction
    await setRLSContext(context);
    
    try {
      return await callback(tx);
    } catch (error) {
      // Transaction will auto-rollback on error
      throw error;
    }
  });
}

/**
 * Complex tenant onboarding transaction
 */
export async function createTenantWithContract(
  data: {
    organizationId: string;
    contractId: string;
    tenantData: {
      email: string;
      name: string;
      percentage?: string;
      isMainTenant?: boolean;
    };
    invitationToken: string;
  }
) {
  return await withTransaction(async (tx) => {
    const { organizationId, contractId, tenantData, invitationToken } = data;

    // 1. Create the tenant user
    const [tenant] = await tx
      .insert(users)
      .values({
        email: tenantData.email,
        name: tenantData.name,
        role: 'tenant',
        organizationId,
        isActive: true,
        emailVerified: new Date(),
      })
      .returning();

    // 2. Create tenant-contract relationship
    const [tenantContract] = await tx
      .insert(tenantContracts)
      .values({
        organizationId,
        tenantId: tenant.id,
        contractId,
        percentage: tenantData.percentage || '100.00',
        isMainTenant: tenantData.isMainTenant || false,
      })
      .returning();

    // 3. Mark invitation as used
    await tx
      .update(invitationTokens)
      .set({ usedAt: new Date() })
      .where(eq(invitationTokens.token, invitationToken));

    return {
      tenant,
      tenantContract,
    };
  });
}

/**
 * Bulk consumption record creation with validation
 */
export async function createBulkConsumptionRecords(
  organizationId: string,
  records: Array<{
    contractId: string;
    consumptionType: string;
    period: string;
    reading: string;
    unit: string;
    cost?: string;
    meterNumber?: string;
    readingDate: Date;
  }>
) {
  return await withTransaction(async (tx) => {
    const createdRecords = [];
    
    for (const record of records) {
      // Check if record already exists for this period
      const [existing] = await tx
        .select({ id: consumptionRecords.id })
        .from(consumptionRecords)
        .where(
          and(
            eq(consumptionRecords.contractId, record.contractId),
            eq(consumptionRecords.consumptionType, record.consumptionType),
            eq(consumptionRecords.period, record.period)
          )
        )
        .limit(1);

      if (existing) {
        // Update existing record
        const [updated] = await tx
          .update(consumptionRecords)
          .set({
            reading: record.reading,
            unit: record.unit,
            cost: record.cost,
            meterNumber: record.meterNumber,
            readingDate: record.readingDate,
            updatedAt: new Date(),
          })
          .where(eq(consumptionRecords.id, existing.id))
          .returning();
        
        createdRecords.push({ ...updated, action: 'updated' });
      } else {
        // Create new record
        const [created] = await tx
          .insert(consumptionRecords)
          .values({
            ...record,
            organizationId,
          })
          .returning();
        
        createdRecords.push({ ...created, action: 'created' });
      }
    }

    return createdRecords;
  });
}

/**
 * Contract termination transaction
 */
export async function terminateContract(
  contractId: string,
  organizationId: string,
  terminationData: {
    endDate: Date;
    terminatedById: string;
    reason?: string;
  }
) {
  return await withTransaction(async (tx) => {
    const { endDate, terminatedById, reason } = terminationData;

    // 1. Update contract
    const [updatedContract] = await tx
      .update(contracts)
      .set({
        endDate,
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contracts.id, contractId),
          eq(contracts.organizationId, organizationId)
        )
      )
      .returning();

    if (!updatedContract) {
      throw new Error('Contract not found or already terminated');
    }

    // 2. Close all open tickets for this contract
    await tx
      .update(tickets)
      .set({
        status: 'closed',
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tickets.contractId, contractId),
          inArray(tickets.status, ['open', 'in_progress', 'waiting_for_tenant'])
        )
      );

    // 3. Create termination document/note if reason provided
    if (reason) {
      await tx
        .insert(documents)
        .values({
          organizationId,
          contractId,
          uploadedById: terminatedById,
          fileName: `contract_termination_${contractId}.txt`,
          originalFileName: 'Contract Termination Notice.txt',
          fileSize: reason.length,
          mimeType: 'text/plain',
          fileUrl: '#', // This would be a generated document
          category: 'document',
          description: `Contract termination reason: ${reason}`,
          isPublic: false,
        });
    }

    return updatedContract;
  });
}

/**
 * Building deletion with cleanup
 */
export async function deleteBuildingWithCleanup(
  buildingId: string,
  organizationId: string
) {
  return await withTransaction(async (tx) => {
    // 1. Check for active contracts
    const [activeContracts] = await tx
      .select({ count: count(contracts.id) })
      .from(contracts)
      .where(
        and(
          eq(contracts.buildingId, buildingId),
          eq(contracts.isActive, true)
        )
      );

    if (Number(activeContracts.count) > 0) {
      throw new Error('Cannot delete building with active contracts');
    }

    // 2. Delete related documents
    await tx
      .delete(documents)
      .where(eq(documents.buildingId, buildingId));

    // 3. Close any remaining tickets
    await tx
      .update(tickets)
      .set({
        status: 'closed',
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tickets.buildingId, buildingId),
          inArray(tickets.status, ['open', 'in_progress', 'waiting_for_tenant'])
        )
      );

    // 4. Delete building
    const [deletedBuilding] = await tx
      .delete(buildings)
      .where(
        and(
          eq(buildings.id, buildingId),
          eq(buildings.organizationId, organizationId)
        )
      )
      .returning();

    return deletedBuilding;
  });
}

/**
 * Tenant removal transaction
 */
export async function removeTenantFromSystem(
  tenantId: string,
  organizationId: string,
  options: {
    reassignTicketsTo?: string;
    closeTickets?: boolean;
  } = {}
) {
  return await withTransaction(async (tx) => {
    const { reassignTicketsTo, closeTickets = true } = options;

    // 1. Remove tenant from all contracts
    await tx
      .delete(tenantContracts)
      .where(
        and(
          eq(tenantContracts.tenantId, tenantId),
          eq(tenantContracts.organizationId, organizationId)
        )
      );

    // 2. Handle tickets created by tenant
    if (reassignTicketsTo) {
      await tx
        .update(tickets)
        .set({
          createdById: reassignTicketsTo,
          updatedAt: new Date(),
        })
        .where(eq(tickets.createdById, tenantId));
    } else if (closeTickets) {
      await tx
        .update(tickets)
        .set({
          status: 'closed',
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tickets.createdById, tenantId),
            inArray(tickets.status, ['open', 'in_progress', 'waiting_for_tenant'])
          )
        );
    }

    // 3. Deactivate user
    const [deactivatedTenant] = await tx
      .update(users)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(users.id, tenantId),
          eq(users.organizationId, organizationId)
        )
      )
      .returning();

    return deactivatedTenant;
  });
}

/**
 * Data integrity check transaction
 */
export async function validateDataIntegrity(organizationId: string) {
  return await withTransaction(async (tx) => {
    const issues: string[] = [];

    // Check for contracts without buildings
    const [orphanedContracts] = await tx
      .select({ count: count(contracts.id) })
      .from(contracts)
      .leftJoin(buildings, eq(contracts.buildingId, buildings.id))
      .where(
        and(
          eq(contracts.organizationId, organizationId),
          sql`${buildings.id} IS NULL`
        )
      );

    if (Number(orphanedContracts.count) > 0) {
      issues.push(`${orphanedContracts.count} contracts without valid buildings`);
    }

    // Check for tenant contracts with inactive users
    const [inactiveTenantContracts] = await tx
      .select({ count: count(tenantContracts.id) })
      .from(tenantContracts)
      .leftJoin(users, eq(tenantContracts.tenantId, users.id))
      .where(
        and(
          eq(tenantContracts.organizationId, organizationId),
          eq(users.isActive, false)
        )
      );

    if (Number(inactiveTenantContracts.count) > 0) {
      issues.push(`${inactiveTenantContracts.count} tenant contracts with inactive users`);
    }

    // Check for tickets without valid buildings
    const [orphanedTickets] = await tx
      .select({ count: count(tickets.id) })
      .from(tickets)
      .leftJoin(buildings, eq(tickets.buildingId, buildings.id))
      .where(
        and(
          eq(tickets.organizationId, organizationId),
          sql`${buildings.id} IS NULL`
        )
      );

    if (Number(orphanedTickets.count) > 0) {
      issues.push(`${orphanedTickets.count} tickets without valid buildings`);
    }

    // Check for consumption records with inactive contracts
    const [invalidConsumption] = await tx
      .select({ count: count(consumptionRecords.id) })
      .from(consumptionRecords)
      .leftJoin(contracts, eq(consumptionRecords.contractId, contracts.id))
      .where(
        and(
          eq(consumptionRecords.organizationId, organizationId),
          eq(contracts.isActive, false)
        )
      );

    if (Number(invalidConsumption.count) > 0) {
      issues.push(`${invalidConsumption.count} consumption records for inactive contracts`);
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  });
}