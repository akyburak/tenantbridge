// src/lib/db/services/index.ts
export { OrganizationService } from './organizations';
export { BuildingService } from './buildings';
export { ContractService } from './contracts';
export { TicketService } from './tickets';
export { ConsumptionService } from './consumption';
export { DocumentService } from './documents';
export { UserService } from './users';

// Re-export common types
export type {
  Organization,
  NewOrganization,
  Building,
  NewBuilding,
  Contract,
  NewContract,
  Ticket,
  NewTicket,
  ConsumptionRecord,
  NewConsumptionRecord,
  Document,
  NewDocument,
  User,
  NewUser,
  TenantContract,
  NewTenantContract,
  InvitationToken,
  NewInvitationToken,
} from '../schema';

// Re-export utilities
export { 
  setRLSContext, 
  clearRLSContext, 
  withRLSContext, 
  createRLSContext,
  checkDatabaseConnection,
  getDatabaseStats 
} from '../utils';

export { 
  withTransaction, 
  withTransactionAndRLS,
  createTenantWithContract,
  createBulkConsumptionRecords,
  terminateContract,
  deleteBuildingWithCleanup,
  removeTenantFromSystem,
  validateDataIntegrity
} from '../transactions';

export { QueryBuilder } from '../queries';

export {
  DatabaseError,
  ValidationError,
  AccessDeniedError,
  NotFoundError,
  ConflictError,
  DatabaseErrorHandler,
  createErrorResponse,
  withErrorHandling
} from '../errors';

export {
  createApiResponse,
  validateRequestBody,
  type ApiResponse
} from '../validations';

/**
 * Centralized service layer for TenantBridge
 * Provides consistent API for all database operations
 */
export class TenantBridgeServices {
  static organizations = OrganizationService;
  static buildings = BuildingService;
  static contracts = ContractService;
  static tickets = TicketService;
  static consumption = ConsumptionService;
  static documents = DocumentService;
  static users = UserService;
  static queries = QueryBuilder;
  
  /**
   * Health check for all services
   */
  static async healthCheck() {
    try {
      await checkDatabaseConnection();
      return { status: 'healthy', timestamp: new Date() };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date() 
      };
    }
  }
}

// Default export for convenience
export default TenantBridgeServices;