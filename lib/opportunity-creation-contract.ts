export interface OpportunityCreationNewClientInput {
  contactName: string;
  companyName: string;
  email?: string | null;
  phone?: string | null;
}

export interface OpportunityCreationRequest {
  creationRequestId: string;
  name: string;
  location?: string | null;
  clientId?: string | null;
  tenderClientIds?: string[];
  newClient?: OpportunityCreationNewClientInput | null;
  ownerUserId?: string | null;
  dueDate?: string | null;
  estimatedValue?: number;
}

export interface OpportunityCreationResponse {
  opportunityId: string;
  opportunitySlug: string;
  workspaceProjectId: string;
  workspaceProjectSlug: string;
  lifecycleId: string | null;
  recordsCreated: boolean;
}
