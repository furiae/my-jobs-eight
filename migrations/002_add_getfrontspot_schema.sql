-- Create leads table for getfrontspot leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  business_name VARCHAR(255) NOT NULL,
  business_type VARCHAR(100),
  getfrontspot_id VARCHAR(255),
  raw_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(email)
);

-- Create lead workflows table to track automation state
CREATE TABLE IF NOT EXISTS lead_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'intake',
  intake_result JSONB,
  analysis_result JSONB,
  presentation_url VARCHAR(500),
  booking_status VARCHAR(100),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lead_id)
);

-- Create workflow executions table for audit logging
CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES lead_workflows(id) ON DELETE CASCADE,
  agent_name VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  result JSONB,
  error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_getfrontspot_id ON leads(getfrontspot_id);
CREATE INDEX IF NOT EXISTS idx_lead_workflows_status ON lead_workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_agent ON workflow_executions(agent_name);
