import "server-only";

import { getOrganizationPermissionsBatch } from "@/lib/permissions-server";
import { getCurrentOrganizationMember } from "@/lib/projects-server";

export type AccountingSyncRequestContext = Readonly<{
  userId: string;
  organizationId: string;
  membershipId: string;
  projectId: string | null;
  claimId: string;
  permissions: Readonly<Record<string, boolean>>;
  featureFlags: Readonly<Record<string, boolean>>;
  accountingDocumentId: string | null;
  revisionId: string | null;
}>;

export function createAccountingSyncRequestContextFromIdentity(params: {
  identity: {
    userId: string;
    organizationId: string;
    membershipId: string;
  };
  claimId: string;
  permissions: Record<string, boolean>;
  featureFlags?: Record<string, boolean>;
  projectId?: string | null;
  accountingDocumentId?: string | null;
  revisionId?: string | null;
}): AccountingSyncRequestContext {
  return Object.freeze({
    userId: params.identity.userId,
    organizationId: params.identity.organizationId,
    membershipId: params.identity.membershipId,
    projectId: params.projectId ?? null,
    claimId: params.claimId,
    permissions: Object.freeze({ ...params.permissions }),
    featureFlags: Object.freeze({ ...(params.featureFlags ?? {}) }),
    accountingDocumentId: params.accountingDocumentId ?? null,
    revisionId: params.revisionId ?? null,
  });
}

export async function createAccountingSyncRequestContext(params: {
  claimId: string;
  permissions: string[];
  featureFlags?: Record<string, boolean>;
  projectId?: string | null;
  accountingDocumentId?: string | null;
  revisionId?: string | null;
}): Promise<AccountingSyncRequestContext | null> {
  const member = await getCurrentOrganizationMember();
  if (!member) return null;
  const permissions = await getOrganizationPermissionsBatch({
    organizationId: member.organization_id,
    permissions: params.permissions,
  });
  return createAccountingSyncRequestContextFromIdentity({
    identity: {
      userId: member.user_id,
      organizationId: member.organization_id,
      membershipId: member.id,
    },
    claimId: params.claimId,
    permissions,
    featureFlags: params.featureFlags,
    projectId: params.projectId,
    accountingDocumentId: params.accountingDocumentId,
    revisionId: params.revisionId,
  });
}

export function extendAccountingSyncRequestContext(
  context: AccountingSyncRequestContext,
  values: {
    projectId?: string | null;
    accountingDocumentId?: string | null;
    revisionId?: string | null;
    featureFlags?: Record<string, boolean>;
  },
): AccountingSyncRequestContext {
  return Object.freeze({
    ...context,
    projectId: values.projectId ?? context.projectId,
    accountingDocumentId:
      values.accountingDocumentId ?? context.accountingDocumentId,
    revisionId: values.revisionId ?? context.revisionId,
    featureFlags: Object.freeze({
      ...context.featureFlags,
      ...(values.featureFlags ?? {}),
    }),
  });
}

export function requestContextMatches(params: {
  context: AccountingSyncRequestContext;
  organizationId: string;
  claimId: string;
}) {
  return params.context.organizationId === params.organizationId
    && params.context.claimId === params.claimId;
}
