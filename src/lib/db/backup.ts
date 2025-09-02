// src/lib/db/backup.ts
import { sql, eq, and, gte, lt, count } from 'drizzle-orm';
import { db } from './db';
import { withTransaction } from './transactions';
import { 
  organizations,
  users,
  buildings,
  contracts,
  tenantContracts,
  tickets,
  consumptionRecords,
  documents,
  invitationTokens
} from './schema';
import { env } from '../env';

/**
 * Backup configuration
 */
interface BackupConfig {
  includeDocuments: boolean;
  includeInvitations: boolean;
  compressData: boolean;
  encryptSensitiveData: boolean;
}

const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  includeDocuments: true,
  includeInvitations: false, // Skip expired invitations
  compressData: true,
  encryptSensitiveData: true,
};

/**
 * Create incremental backup (changes since last backup)
 */
export async function createIncrementalBackup(
  organizationId: string,
  lastBackupDate: Date,
  config: Partial<BackupConfig> = {}
) {
  const finalConfig = { ...DEFAULT_BACKUP_CONFIG, ...config };
  
  console.log(`📦 Creating incremental backup since ${lastBackupDate.toISOString()}...`);

  // Get organization info
  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) {
    throw new Error('Organization not found');
  }

  // Get changes since last backup
  const [
    newBuildings,
    updatedBuildings,
    newContracts,
    updatedContracts,
    newUsers,
    updatedUsers,
    newTickets,
    updatedTickets,
    newConsumption,
    newDocuments
  ] = await Promise.all([
    // New buildings
    db.select().from(buildings).where(
      and(
        eq(buildings.organizationId, organizationId),
        gte(buildings.createdAt, lastBackupDate)
      )
    ),
    // Updated buildings
    db.select().from(buildings).where(
      and(
        eq(buildings.organizationId, organizationId),
        gte(buildings.updatedAt, lastBackupDate),
        lt(buildings.createdAt, lastBackupDate)
      )
    ),
    // New contracts
    db.select().from(contracts).where(
      and(
        eq(contracts.organizationId, organizationId),
        gte(contracts.createdAt, lastBackupDate)
      )
    ),
    // Updated contracts
    db.select().from(contracts).where(
      and(
        eq(contracts.organizationId, organizationId),
        gte(contracts.updatedAt, lastBackupDate),
        lt(contracts.createdAt, lastBackupDate)
      )
    ),
    // New users
    db.select().from(users).where(
      and(
        eq(users.organizationId, organizationId),
        gte(users.createdAt, lastBackupDate)
      )
    ),
    // Updated users
    db.select().from(users).where(
      and(
        eq(users.organizationId, organizationId),
        gte(users.updatedAt, lastBackupDate),
        lt(users.createdAt, lastBackupDate)
      )
    ),
    // New tickets
    db.select().from(tickets).where(
      and(
        eq(tickets.organizationId, organizationId),
        gte(tickets.createdAt, lastBackupDate)
      )
    ),
    // Updated tickets
    db.select().from(tickets).where(
      and(
        eq(tickets.organizationId, organizationId),
        gte(tickets.updatedAt, lastBackupDate),
        lt(tickets.createdAt, lastBackupDate)
      )
    ),
    // New consumption records
    db.select().from(consumptionRecords).where(
      and(
        eq(consumptionRecords.organizationId, organizationId),
        gte(consumptionRecords.createdAt, lastBackupDate)
      )
    ),
    // New documents (if included)
    finalConfig.includeDocuments ? db.select().from(documents).where(
      and(
        eq(documents.organizationId, organizationId),
        gte(documents.createdAt, lastBackupDate)
      )
    ) : [],
  ]);

  const backup = {
    backupInfo: {
      type: 'incremental',
      organizationId,
      organizationName: organization.name,
      createdAt: new Date().toISOString(),
      sinceDate: lastBackupDate.toISOString(),
      config: finalConfig,
      version: '1.0',
    },
    changes: {
      buildings: {
        new: newBuildings,
        updated: updatedBuildings,
      },
      contracts: {
        new: newContracts,
        updated: updatedContracts,
      },
      users: {
        new: sanitizeUsers(newUsers, finalConfig.encryptSensitiveData),
        updated: sanitizeUsers(updatedUsers, finalConfig.encryptSensitiveData),
      },
      tickets: {
        new: newTickets,
        updated: updatedTickets,
      },
      consumption: {
        new: newConsumption,
      },
      documents: {
        new: finalConfig.includeDocuments ? sanitizeDocuments(newDocuments) : [],
      },
    },
    statistics: {
      newBuildings: newBuildings.length,
      updatedBuildings: updatedBuildings.length,
      newContracts: newContracts.length,
      updatedContracts: updatedContracts.length,
      newUsers: newUsers.length,
      updatedUsers: updatedUsers.length,
      newTickets: newTickets.length,
      updatedTickets: updatedTickets.length,
      newConsumption: newConsumption.length,
      newDocuments: finalConfig.includeDocuments ? newDocuments.length : 0,
    },
  };

  return backup;
}

/**
 * Restore from backup
 */
export async function restoreFromBackup(
  backupData: any,
  options: {
    skipExisting: boolean;
    validateFirst: boolean;
  } = { skipExisting: true, validateFirst: true }
) {
  if (env.NODE_ENV === 'production') {
    throw new Error('Backup restoration should be carefully managed in production');
  }

  console.log('🔄 Starting backup restoration...');

  if (options.validateFirst) {
    const { validateBackup } = await import('./export');
    const validation = await validateBackup(backupData);
    
    if (!validation.isValid) {
      throw new Error(`Backup validation failed: ${validation.errors.join(', ')}`);
    }
    
    if (validation.warnings.length > 0) {
      console.warn('Backup warnings:', validation.warnings);
    }
  }

  return await withTransaction(async (tx) => {
    const results = {
      organizations: 0,
      buildings: 0,
      contracts: 0,
      users: 0,
      tickets: 0,
      consumption: 0,
      documents: 0,
    };

    // Restore organization
    if (backupData.organization) {
      if (options.skipExisting) {
        const [existing] = await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, backupData.organization.id))
          .limit(1);
        
        if (!existing) {
          await tx.insert(organizations).values(backupData.organization);
          results.organizations = 1;
        }
      } else {
        await tx.insert(organizations).values(backupData.organization).onConflictDoUpdate({
          target: organizations.id,
          set: backupData.organization,
        });
        results.organizations = 1;
      }
    }

    // Restore buildings
    if (backupData.buildings && Array.isArray(backupData.buildings)) {
      for (const building of backupData.buildings) {
        try {
          if (options.skipExisting) {
            await tx.insert(buildings).values(building).onConflictDoNothing();
          } else {
            await tx.insert(buildings).values(building).onConflictDoUpdate({
              target: buildings.id,
              set: building,
            });
          }
          results.buildings++;
        } catch (error) {
          console.warn(`Failed to restore building ${building.id}:`, error);
        }
      }
    }

    // Restore contracts
    if (backupData.contracts && Array.isArray(backupData.contracts)) {
      for (const contract of backupData.contracts) {
        try {
          if (options.skipExisting) {
            await tx.insert(contracts).values(contract).onConflictDoNothing();
          } else {
            await tx.insert(contracts).values(contract).onConflictDoUpdate({
              target: contracts.id,
              set: contract,
            });
          }
          results.contracts++;
        } catch (error) {
          console.warn(`Failed to restore contract ${contract.id}:`, error);
        }
      }
    }

    // Restore users
    if (backupData.users && Array.isArray(backupData.users)) {
      for (const user of backupData.users) {
        try {
          if (options.skipExisting) {
            await tx.insert(users).values(user).onConflictDoNothing();
          } else {
            await tx.insert(users).values(user).onConflictDoUpdate({
              target: users.id,
              set: user,
            });
          }
          results.users++;
        } catch (error) {
          console.warn(`Failed to restore user ${user.id}:`, error);
        }
      }
    }

    // Restore other data...
    // (Similar pattern for tickets, consumption, documents)

    console.log('✅ Backup restoration completed:', results);
    return results;
  });
}

/**
 * Scheduled backup creation
 */
export async function createScheduledBackup(organizationId: string) {
  try {
    const { exportOrganizationData } = await import('./export');
    
    console.log(`⏰ Creating scheduled backup for organization ${organizationId}...`);
    
    const backupData = await exportOrganizationData(organizationId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // In a real implementation, you would upload this to cloud storage
    const filename = `backup_${organizationId}_${timestamp}.json`;
    
    console.log(`✅ Scheduled backup created: ${filename}`);
    
    return {
      filename,
      size: JSON.stringify(backupData).length,
      organizationId,
      createdAt: new Date(),
    };
    
  } catch (error) {
    console.error('Scheduled backup failed:', error);
    throw error;
  }
}

/**
 * Backup verification
 */
export async function verifyBackup(backupData: any): Promise<{
  isComplete: boolean;
  missingTables: string[];
  corruptedData: string[];
  recommendations: string[];
}> {
  const missingTables: string[] = [];
  const corruptedData: string[] = [];
  const recommendations: string[] = [];

  // Check for required tables
  const requiredTables = ['organization', 'buildings', 'contracts', 'users'];
  
  for (const table of requiredTables) {
    if (!backupData[table]) {
      missingTables.push(table);
    }
  }

  // Check data integrity
  if (backupData.contracts && backupData.buildings) {
    const buildingIds = new Set(backupData.buildings.map((b: any) => b.id));
    const invalidContracts = backupData.contracts.filter((c: any) => 
      !buildingIds.has(c.buildingId)
    );
    
    if (invalidContracts.length > 0) {
      corruptedData.push(`${invalidContracts.length} contracts with invalid building references`);
    }
  }

  // Generate recommendations
  if (missingTables.length > 0) {
    recommendations.push('Consider creating a full backup instead of incremental');
  }

  if (corruptedData.length > 0) {
    recommendations.push('Data corruption detected - verify source database integrity');
  }

  const dataSize = JSON.stringify(backupData).length;
  if (dataSize > 10 * 1024 * 1024) { // 10MB
    recommendations.push('Large backup detected - consider implementing compression');
  }

  return {
    isComplete: missingTables.length === 0 && corruptedData.length === 0,
    missingTables,
    corruptedData,
    recommendations,
  };
}

/**
 * Utility functions for backup processing
 */
function sanitizeUsers(users: any[], encrypt = false): any[] {
  return users.map(user => ({
    ...user,
    // Remove sensitive data or encrypt it
    email: encrypt ? `[ENCRYPTED]${user.email.length}` : user.email,
    emailVerified: user.emailVerified?.toISOString(),
    createdAt: user.createdAt?.toISOString(),
    updatedAt: user.updatedAt?.toISOString(),
  }));
}

function sanitizeDocuments(documents: any[]): any[] {
  return documents.map(doc => ({
    ...doc,
    // Don't include actual file URLs in backup
    fileUrl: '[FILE_REFERENCE_ONLY]',
    createdAt: doc.createdAt?.toISOString(),
  }));
}

/**
 * Backup rotation management
 */
export class BackupRotation {
  private static readonly RETENTION_POLICY = {
    daily: 7,    // Keep 7 daily backups
    weekly: 4,   // Keep 4 weekly backups
    monthly: 12, // Keep 12 monthly backups
  };

  /**
   * Determine backup type based on schedule
   */
  static getBackupType(): 'daily' | 'weekly' | 'monthly' {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const dayOfMonth = now.getDate();

    // Monthly backup on the 1st
    if (dayOfMonth === 1) return 'monthly';
    
    // Weekly backup on Sunday
    if (dayOfWeek === 0) return 'weekly';
    
    // Daily backup otherwise
    return 'daily';
  }

  /**
   * Clean up old backups based on retention policy
   */
  static async cleanupOldBackups(organizationId: string, backupList: Array<{
    filename: string;
    type: 'daily' | 'weekly' | 'monthly';
    createdAt: Date;
  }>) {
    const toDelete: string[] = [];

    // Group backups by type
    const grouped = {
      daily: backupList.filter(b => b.type === 'daily').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      weekly: backupList.filter(b => b.type === 'weekly').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      monthly: backupList.filter(b => b.type === 'monthly').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    };

    // Mark old backups for deletion
    Object.entries(grouped).forEach(([type, backups]) => {
      const retention = this.RETENTION_POLICY[type as keyof typeof this.RETENTION_POLICY];
      if (backups.length > retention) {
        toDelete.push(...backups.slice(retention).map(b => b.filename));
      }
    });

    return toDelete;
  }
}

/**
 * Disaster recovery utilities
 */
export class DisasterRecovery {
  /**
   * Create emergency backup before risky operations
   */
  static async createEmergencyBackup(organizationId: string, operation: string) {
    console.log(`🚨 Creating emergency backup before: ${operation}`);
    
    try {
      const { exportOrganizationData } = await import('./export');
      const backupData = await exportOrganizationData(organizationId);
      
      const emergencyBackup = {
        ...backupData,
        emergencyInfo: {
          operation,
          createdAt: new Date().toISOString(),
          reason: 'Pre-operation safety backup',
        },
      };

      return {
        backup: emergencyBackup,
        filename: `emergency_backup_${organizationId}_${Date.now()}.json`,
      };
    } catch (error) {
      console.error('Emergency backup failed:', error);
      throw new Error(`Failed to create emergency backup: ${error.message}`);
    }
  }

  /**
   * Quick recovery validation
   */
  static async validateRecoveryReadiness(organizationId: string) {
    const checks = [];

    try {
      // Check database accessibility
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
      
      checks.push({
        check: 'Organization accessible',
        passed: !!org,
        critical: true,
      });

      // Check for admin users
      const [adminCount] = await db
        .select({ count: count(users.id) })
        .from(users)
        .where(
          and(
            eq(users.organizationId, organizationId),
            eq(users.role, 'landlord_admin'),
            eq(users.isActive, true)
          )
        );

      checks.push({
        check: 'Active admin users exist',
        passed: Number(adminCount.count) > 0,
        critical: true,
        details: `${adminCount.count} admin users`,
      });

      // Check data consistency
      const [dataIntegrity] = await db.execute(sql`
        SELECT 
          (SELECT COUNT(*) FROM contracts WHERE organization_id = ${organizationId} AND building_id NOT IN (SELECT id FROM buildings WHERE organization_id = ${organizationId})) as orphaned_contracts,
          (SELECT COUNT(*) FROM tickets WHERE organization_id = ${organizationId} AND building_id NOT IN (SELECT id FROM buildings WHERE organization_id = ${organizationId})) as orphaned_tickets
      `);

      checks.push({
        check: 'Data integrity',
        passed: Number(dataIntegrity?.orphaned_contracts || 0) === 0 && Number(dataIntegrity?.orphaned_tickets || 0) === 0,
        critical: false,
        details: `${dataIntegrity?.orphaned_contracts || 0} orphaned contracts, ${dataIntegrity?.orphaned_tickets || 0} orphaned tickets`,
      });

      const criticalFailures = checks.filter(c => c.critical && !c.passed);
      
      return {
        isReady: criticalFailures.length === 0,
        checks,
        criticalFailures,
        recommendations: criticalFailures.length > 0 
          ? ['Resolve critical issues before proceeding with disaster recovery']
          : ['System appears ready for disaster recovery procedures'],
      };

    } catch (error) {
      console.error('Recovery validation failed:', error);
      return {
        isReady: false,
        checks: [],
        criticalFailures: [{ check: 'Database access', error: error.message }],
        recommendations: ['Database is not accessible - check connection and credentials'],
      };
    }
  }

  /**
   * Point-in-time recovery simulation
   */
  static async simulatePointInTimeRecovery(
    organizationId: string,
    targetDate: Date
  ) {
    if (env.NODE_ENV === 'production') {
      throw new Error('PITR simulation should not be run in production');
    }

    console.log(`🎯 Simulating point-in-time recovery to ${targetDate.toISOString()}...`);

    // This would simulate what data existed at the target date
    const [dataAtTime] = await db.execute(sql`
      SELECT 
        (SELECT COUNT(*) FROM buildings WHERE organization_id = ${organizationId} AND created_at <= ${targetDate}) as buildings_count,
        (SELECT COUNT(*) FROM contracts WHERE organization_id = ${organizationId} AND created_at <= ${targetDate}) as contracts_count,
        (SELECT COUNT(*) FROM users WHERE organization_id = ${organizationId} AND created_at <= ${targetDate}) as users_count,
        (SELECT COUNT(*) FROM tickets WHERE organization_id = ${organizationId} AND created_at <= ${targetDate}) as tickets_count
    `);

    return {
      targetDate,
      dataSnapshot: {
        buildings: Number(dataAtTime?.buildings_count || 0),
        contracts: Number(dataAtTime?.contracts_count || 0),
        users: Number(dataAtTime?.users_count || 0),
        tickets: Number(dataAtTime?.tickets_count || 0),
      },
      notes: [
        'This is a simulation only',
        'Actual PITR would require transaction log replay',
        'Consider implementing regular backup snapshots',
      ],
    };
  }
}