import { NextResponse } from "next/server";
import {
  completeXeroOAuthCallback,
  getCurrentXeroCallbackUserId,
  recordXeroOAuthCallbackFailure,
  XeroOAuthFlowError,
} from "@/lib/xero/service";
import { enqueueOrganizationXeroSync } from "@/lib/xero/sync";

function integrationRedirect(request: Request, params: {
  path?: string;
  message?: string;
  errorCode?: string;
  correlationId?: string;
}) {
  const url = new URL(params.path ?? "/app/settings/integrations", request.url);
  if (params.message) url.searchParams.set("message", params.message);
  if (params.errorCode) url.searchParams.set("error_code", params.errorCode);
  if (params.correlationId) url.searchParams.set("correlation_id", params.correlationId);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim() ?? "";
  const state = searchParams.get("state")?.trim() ?? "";
  const error = searchParams.get("error")?.trim() ?? "";
  const currentUserId = await getCurrentXeroCallbackUserId().catch(() => null);

  if (error) {
    if (!currentUserId) {
      return integrationRedirect(request, { errorCode: "xero_callback_session_missing" });
    }
    try {
      const recorded = state
        ? await recordXeroOAuthCallbackFailure({
            state,
            currentUserId,
            code: "xero_callback_access_denied",
          })
        : null;
      return integrationRedirect(request, {
        errorCode: "xero_callback_access_denied",
        correlationId: recorded?.correlationId,
      });
    } catch (recordError) {
      const correlationId = recordError instanceof XeroOAuthFlowError
        ? recordError.correlationId
        : undefined;
      console.error("Unable to record denied Xero callback", {
        correlationId,
        code: recordError instanceof XeroOAuthFlowError ? recordError.code : "xero_callback_access_denied",
      });
      return integrationRedirect(request, {
        errorCode: recordError instanceof XeroOAuthFlowError
          ? recordError.code
          : "xero_callback_access_denied",
        correlationId,
      });
    }
  }

  if (!code || !state) {
    if (state && currentUserId) {
      await recordXeroOAuthCallbackFailure({
        state,
        currentUserId,
        code: "xero_callback_missing_parameters",
      }).catch(() => undefined);
    }
    return integrationRedirect(request, { errorCode: "xero_callback_missing_parameters" });
  }

  try {
    if (!currentUserId) {
      return integrationRedirect(request, { errorCode: "xero_callback_session_missing" });
    }

    const result = await completeXeroOAuthCallback({ code, state, currentUserId });

    if (result.autoSelectedTenant) {
      await enqueueOrganizationXeroSync({
        organizationId: result.organizationId,
        connectionId: result.connection.id,
        createdByUserId: result.connection.connected_by_user_id,
        triggerSource: "oauth_callback",
        includeHealthCheck: true,
        includeContacts: true,
      }).catch((queueError) => {
        console.error("Xero connected but reference sync enqueue failed", {
          correlationId: result.correlationId,
          code: "xero_callback_sync_queue_failed",
          message: queueError instanceof Error ? queueError.message : "unknown",
        });
      });

      return integrationRedirect(request, {
        path: result.redirectPath,
        message: "Xero reconnect completed. Reference data and contacts are queued for background refresh.",
        correlationId: result.correlationId,
      });
    }

    return integrationRedirect(request, {
      path: result.redirectPath,
      message: "Xero authorization completed. Select the tenant to finish setup.",
      correlationId: result.correlationId,
    });
  } catch (callbackError) {
    const code = callbackError instanceof XeroOAuthFlowError
      ? callbackError.code
      : "xero_callback_persistence_failed";
    const correlationId = callbackError instanceof XeroOAuthFlowError
      ? callbackError.correlationId
      : undefined;
    console.error("Xero callback failed", { correlationId, code });
    return integrationRedirect(request, { errorCode: code, correlationId });
  }
}
