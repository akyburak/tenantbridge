-- src/lib/db/rls-setup.sql
-- Row-Level Security (RLS) setup for TenantBridge multi-tenancy

-- Enable RLS on all tenant-isolated tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumption_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_tokens ENABLE ROW LEVEL SECURITY;

-- Create function to get current user's organization ID
CREATE OR REPLACE FUNCTION current_organization_id()
RETURNS UUID AS $$
BEGIN
    -- This will be set by the application layer
    RETURN COALESCE(
        current_setting('app.current_organization_id', true)::UUID,
        '00000000-0000-0000-0000-000000000000'::UUID
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Create function to get current user ID
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID AS $$
BEGIN
    -- This will be set by the application layer
    RETURN COALESCE(
        current_setting('app.current_user_id', true)::UUID,
        '00000000-0000-0000-0000-000000000000'::UUID
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Create function to get current user role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT AS $$
BEGIN
    -- This will be set by the application layer
    RETURN current_setting('app.current_user_role', true);
END;
$$ LANGUAGE plpgsql STABLE;

-- Organizations: Users can only see their own organization
CREATE POLICY "organization_isolation" ON organizations
    FOR ALL TO public
    USING (id = current_organization_id());

-- Users: Users can only see users from their organization
CREATE POLICY "users_isolation" ON users
    FOR ALL TO public
    USING (organization_id = current_organization_id());

-- Buildings: Users can only see buildings from their organization
CREATE POLICY "buildings_isolation" ON buildings
    FOR ALL TO public
    USING (organization_id = current_organization_id());

-- Contracts: Users can only see contracts from their organization
-- Tenants can only see contracts they are associated with
CREATE POLICY "contracts_isolation" ON contracts
    FOR ALL TO public
    USING (
        organization_id = current_organization_id() AND (
            current_user_role() = 'landlord_admin' OR
            id IN (
                SELECT contract_id FROM tenant_contracts 
                WHERE tenant_id = current_user_id()
            )
        )
    );

-- Tenant Contracts: Users can only see their own tenant contracts
CREATE POLICY "tenant_contracts_isolation" ON tenant_contracts
    FOR ALL TO public
    USING (
        organization_id = current_organization_id() AND (
            current_user_role() = 'landlord_admin' OR
            tenant_id = current_user_id()
        )
    );

-- Tickets: Users can see tickets from their organization
-- Tenants can only see tickets they created or are related to their contracts
CREATE POLICY "tickets_isolation" ON tickets
    FOR ALL TO public
    USING (
        organization_id = current_organization_id() AND (
            current_user_role() = 'landlord_admin' OR
            created_by_id = current_user_id() OR
            contract_id IN (
                SELECT contract_id FROM tenant_contracts 
                WHERE tenant_id = current_user_id()
            )
        )
    );

-- Consumption Records: Users can see records from their organization
-- Tenants can only see records for their contracts
CREATE POLICY "consumption_isolation" ON consumption_records
    FOR ALL TO public
    USING (
        organization_id = current_organization_id() AND (
            current_user_role() = 'landlord_admin' OR
            contract_id IN (
                SELECT contract_id FROM tenant_contracts 
                WHERE tenant_id = current_user_id()
            )
        )
    );

-- Documents: Users can see documents from their organization
-- Tenants can only see public documents or documents related to their contracts/tickets
CREATE POLICY "documents_isolation" ON documents
    FOR ALL TO public
    USING (
        organization_id = current_organization_id() AND (
            current_user_role() = 'landlord_admin' OR
            is_public = true OR
            contract_id IN (
                SELECT contract_id FROM tenant_contracts 
                WHERE tenant_id = current_user_id()
            ) OR
            ticket_id IN (
                SELECT id FROM tickets 
                WHERE created_by_id = current_user_id()
            )
        )
    );

-- Invitation Tokens: Only landlord admins can manage invitations
CREATE POLICY "invitations_admin_only" ON invitation_tokens
    FOR ALL TO public
    USING (
        organization_id = current_organization_id() AND
        current_user_role() = 'landlord_admin'
    );

-- Grant necessary permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO public;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO public;

-- Create indexes for RLS performance
CREATE INDEX IF NOT EXISTS idx_rls_org_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_rls_tenant_contracts ON tenant_contracts(tenant_id, contract_id);
CREATE INDEX IF NOT EXISTS idx_rls_tickets_created_by ON tickets(created_by_id);
CREATE INDEX IF NOT EXISTS idx_rls_documents_public ON documents(is_public) WHERE is_public = true;