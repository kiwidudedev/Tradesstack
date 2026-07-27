import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.RETENTION_PHASE1_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const OWNER_ID = "e1000000-0000-4000-8000-000000000001";
const QS_ID = "e1000000-0000-4000-8000-000000000002";
const OTHER_OWNER_ID = "e1000000-0000-4000-8000-000000000003";
const ORGANIZATION_ID = "e1000000-0000-4000-8000-000000000010";
const OTHER_ORGANIZATION_ID = "e1000000-0000-4000-8000-000000000011";
const PROJECT_ID = "e1000000-0000-4000-8000-000000000100";
const OTHER_PROJECT_ID = "e1000000-0000-4000-8000-000000000101";

const PERMISSION_KEYS = [
  "retention.view",
  "retention.schedules.manage",
  "retention.schedules.confirm",
  "retention.reminders.manage",
  "retention.claims.create",
  "retention.claims.submit",
  "retention.claims.xero_manage",
  "retention.claims.void_request",
  "retention.claims.void_approve",
  "retention.variances.view",
  "retention.variances.resolve",
  "retention.variances.override",
  "retention.legacy.reconcile",
  "retention.legacy.approve",
  "retention.cutover.manage",
] as const;

type CapabilityMutationRow = {
  succeeded: boolean;
  error_code: string | null;
  changed: boolean;
  organization_id: string;
  enabled: boolean;
};

type TransitionRow = {
  succeeded: boolean;
  error_code: string | null;
  changed: boolean;
  organization_id: string;
  project_id: string;
  previous_mode: string;
  mode: string;
};

describeDatabase("Retention Management Phase 1 database behavior", () => {
  const client = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await seedIdentityAndTenants();
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  async function asUser(userId: string) {
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
  }

  async function expectDatabaseError(
    action: () => Promise<unknown>,
    message: string,
  ) {
    await client.query("savepoint retention_phase1_expected_error");
    let caught: unknown;
    try {
      await action();
    } catch (error) {
      caught = error;
    }
    await client.query("rollback to savepoint retention_phase1_expected_error");
    await client.query("release savepoint retention_phase1_expected_error");
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(message);
  }

  async function seedIdentityAndTenants() {
    await client.query(
      `insert into auth.users
        (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
       values
        ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'retention-phase1-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb),
        ($2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'retention-phase1-qs@example.test', '', now(), '{}'::jsonb, '{}'::jsonb),
        ($3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'retention-phase1-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb)`,
      [OWNER_ID, QS_ID, OTHER_OWNER_ID],
    );
    await client.query(
      "delete from public.organizations where created_by = any($1::uuid[])",
      [[OWNER_ID, QS_ID, OTHER_OWNER_ID]],
    );
    await client.query(
      `insert into public.organizations (id, name, created_by)
       values
        ($1, 'Retention Phase 1', $3),
        ($2, 'Retention Phase 1 Other', $4)`,
      [ORGANIZATION_ID, OTHER_ORGANIZATION_ID, OWNER_ID, OTHER_OWNER_ID],
    );
    await client.query(
      `insert into public.organization_members
        (organization_id, user_id, role, display_name)
       values
        ($1, $3, 'owner', 'Retention Owner'),
        ($1, $4, 'qs', 'Retention QS'),
        ($2, $5, 'owner', 'Other Retention Owner')`,
      [ORGANIZATION_ID, OTHER_ORGANIZATION_ID, OWNER_ID, QS_ID, OTHER_OWNER_ID],
    );
    await client.query(
      `insert into public.organization_projects
        (id, organization_id, created_by, name, slug, project_code)
       values
        ($1, $3, $5, 'Retention Phase 1 Project', 'retention-phase-1', 'RET-P1'),
        ($2, $4, $6, 'Other Retention Project', 'other-retention-phase-1', 'RET-OTHER')`,
      [
        PROJECT_ID,
        OTHER_PROJECT_ID,
        ORGANIZATION_ID,
        OTHER_ORGANIZATION_ID,
        OWNER_ID,
        OTHER_OWNER_ID,
      ],
    );
    await asUser(OWNER_ID);
  }

  async function setCapability(enabled: boolean, reason = "Phase 1 characterization") {
    const result = await client.query<CapabilityMutationRow>(
      "select * from public.set_organization_retention_capability($1, $2, $3)",
      [enabled, reason, "phase1-capability"],
    );
    return result.rows[0];
  }

  async function transition(
    newMode: string,
    reason = "Phase 1 transition characterization",
    projectId = PROJECT_ID,
  ) {
    const result = await client.query<TransitionRow>(
      "select * from public.transition_project_retention_workflow_mode($1, $2, $3, $4)",
      [projectId, newMode, reason, `phase1-${newMode}`],
    );
    return result.rows[0];
  }

  it("creates every permission with the conservative role mapping and preserves Payment Claim grants", async () => {
    const permissions = await client.query<{ permission_key: string }>(
      `select permission_key
       from public.app_permissions
       where permission_key = any($1::text[])
       order by permission_key`,
      [PERMISSION_KEYS],
    );
    expect(permissions.rows.map((row) => row.permission_key)).toEqual(
      [...PERMISSION_KEYS].sort(),
    );

    const roleRows = await client.query<{
      role: string;
      permission_key: string;
      is_allowed: boolean;
    }>(
      `select role, permission_key, is_allowed
       from public.role_permissions
       where permission_key = any($1::text[])
       order by role, permission_key`,
      [PERMISSION_KEYS],
    );
    expect(roleRows.rows).toHaveLength(PERMISSION_KEYS.length * 5);
    for (const row of roleRows.rows) {
      const expectedReadOnly =
        (row.role === "qs" || row.role === "project_manager")
        && (row.permission_key === "retention.view"
          || row.permission_key === "retention.variances.view");
      expect(row.is_allowed).toBe(
        row.role === "owner" || row.role === "admin" || expectedReadOnly,
      );
    }

    const paymentClaimPermissionBaseline = await client.query<{
      role: string;
      is_allowed: boolean;
    }>(
      `select role, is_allowed
       from public.role_permissions
       where permission_key = 'quotes.write'
       order by role`,
    );
    expect(paymentClaimPermissionBaseline.rows).toEqual([
      { role: "admin", is_allowed: true },
      { role: "owner", is_allowed: true },
      { role: "project_manager", is_allowed: true },
      { role: "qs", is_allowed: true },
      { role: "worker", is_allowed: false },
    ]);
  });

  it("defaults every organization to disabled and every project to legacy with unique identities", async () => {
    const capabilities = await client.query<{
      organization_id: string;
      capability_key: string;
      enabled: boolean;
    }>(
      `select organization_id, capability_key, enabled
       from public.organization_capabilities
       where organization_id = any($1::uuid[])
       order by organization_id`,
      [[ORGANIZATION_ID, OTHER_ORGANIZATION_ID]],
    );
    expect(capabilities.rows).toEqual([
      {
        organization_id: ORGANIZATION_ID,
        capability_key: "retention_management",
        enabled: false,
      },
      {
        organization_id: OTHER_ORGANIZATION_ID,
        capability_key: "retention_management",
        enabled: false,
      },
    ]);

    const states = await client.query<{
      organization_id: string;
      project_id: string;
      mode: string;
    }>(
      `select organization_id, project_id, mode
       from public.project_retention_workflow_states
       where project_id = any($1::uuid[])
       order by project_id`,
      [[PROJECT_ID, OTHER_PROJECT_ID]],
    );
    expect(states.rows).toEqual([
      { organization_id: ORGANIZATION_ID, project_id: PROJECT_ID, mode: "legacy" },
      {
        organization_id: OTHER_ORGANIZATION_ID,
        project_id: OTHER_PROJECT_ID,
        mode: "legacy",
      },
    ]);

    await expectDatabaseError(
      () => client.query(
        `insert into public.organization_capabilities
          (organization_id, capability_key, enabled)
         values ($1, 'retention_management', false)`,
        [ORGANIZATION_ID],
      ),
      "duplicate key",
    );
    await expectDatabaseError(
      () => client.query(
        `update public.project_retention_workflow_states
         set organization_id = $1
         where project_id = $2`,
        [OTHER_ORGANIZATION_ID, PROJECT_ID],
      ),
      "violates foreign key constraint",
    );
  });

  it("denies unauthorized management, cross-tenant access, and direct authenticated writes", async () => {
    await asUser(QS_ID);
    const denied = await setCapability(true, "QS attempted enable");
    expect(denied).toMatchObject({
      succeeded: false,
      error_code: "permission_denied",
      changed: false,
      organization_id: ORGANIZATION_ID,
      enabled: false,
    });

    const deniedEvents = await client.query<{ event_type: string; actor_user_id: string }>(
      `select event_type, actor_user_id
       from public.retention_capability_events
       where organization_id = $1`,
      [ORGANIZATION_ID],
    );
    expect(deniedEvents.rows).toContainEqual({
      event_type: "management_permission_denied",
      actor_user_id: QS_ID,
    });

    const crossTenantRead = await client.query(
      "select * from public.get_project_retention_workflow_state($1)",
      [OTHER_PROJECT_ID],
    );
    expect(crossTenantRead.rows).toEqual([]);
    const crossTenantMutation = await transition(
      "observe",
      "Attempted cross-tenant transition",
      OTHER_PROJECT_ID,
    );
    expect(crossTenantMutation).toMatchObject({
      succeeded: false,
      error_code: "project_not_found",
      changed: false,
    });

    await expectDatabaseError(async () => {
      await client.query("set local role authenticated");
      await client.query(
        `update public.organization_capabilities
         set enabled = true
         where organization_id = $1 and capability_key = 'retention_management'`,
        [ORGANIZATION_ID],
      );
    }, "permission denied");
    await expectDatabaseError(async () => {
      await client.query("set local role authenticated");
      await client.query(
        `update public.project_retention_workflow_states
         set mode = 'observe'
         where project_id = $1`,
        [PROJECT_ID],
      );
    }, "permission denied");
    await asUser(OWNER_ID);
  });

  it("enables and disables capability with idempotent reads and append-only audit events", async () => {
    const initialReads = await Promise.all([
      client.query("select * from public.get_organization_retention_capability()"),
      client.query("select * from public.get_organization_retention_capability()"),
    ]);
    expect(initialReads[0].rows).toEqual(initialReads[1].rows);
    expect(initialReads[0].rows[0]).toMatchObject({
      organization_id: ORGANIZATION_ID,
      capability_key: "retention_management",
      enabled: false,
    });

    const enabled = await setCapability(true, "Enable Retention Management");
    expect(enabled).toMatchObject({ succeeded: true, changed: true, enabled: true });
    const repeatedEnable = await setCapability(true, "Idempotent enable");
    expect(repeatedEnable).toMatchObject({
      succeeded: true,
      changed: false,
      enabled: true,
    });
    const disabled = await setCapability(false, "Disable Retention Management");
    expect(disabled).toMatchObject({ succeeded: true, changed: true, enabled: false });

    const events = await client.query<{ event_type: string }>(
      `select event_type
       from public.retention_capability_events
       where organization_id = $1
         and event_type like 'organization_capability_%'
       order by occurred_at, id`,
      [ORGANIZATION_ID],
    );
    expect(events.rows.map((event) => event.event_type).sort()).toEqual([
      "organization_capability_disabled",
      "organization_capability_enabled",
    ]);

    const eventId = await client.query<{ id: string }>(
      `select id from public.retention_capability_events
       where organization_id = $1 order by occurred_at limit 1`,
      [ORGANIZATION_ID],
    );
    await expectDatabaseError(
      () => client.query(
        "update public.retention_capability_events set reason = 'Changed' where id = $1",
        [eventId.rows[0].id],
      ),
      "append-only",
    );
    await expectDatabaseError(
      () => client.query(
        "delete from public.retention_capability_events where id = $1",
        [eventId.rows[0].id],
      ),
      "append-only",
    );
  });

  it("requires capability, reason, and the conservative server transition matrix", async () => {
    const disabledAttempt = await transition("observe");
    expect(disabledAttempt).toMatchObject({
      succeeded: false,
      error_code: "capability_disabled",
      changed: false,
      previous_mode: "legacy",
      mode: "legacy",
    });

    await setCapability(true, "Enable for transition testing");
    const missingReason = await transition("observe", "   ");
    expect(missingReason).toMatchObject({
      succeeded: false,
      error_code: "reason_required",
      changed: false,
    });
    const invalidFromLegacy = await transition("blocked");
    expect(invalidFromLegacy).toMatchObject({
      succeeded: false,
      error_code: "transition_not_allowed",
      changed: false,
    });
    const reservedReady = await transition("ready");
    expect(reservedReady).toMatchObject({
      succeeded: false,
      error_code: "reserved_until_readiness",
      changed: false,
    });
    const reservedCutover = await transition("cutover");
    expect(reservedCutover).toMatchObject({
      succeeded: false,
      error_code: "reserved_until_readiness",
      changed: false,
    });

    expect(await transition("observe")).toMatchObject({
      succeeded: true,
      changed: true,
      previous_mode: "legacy",
      mode: "observe",
    });
    expect(await transition("blocked")).toMatchObject({
      succeeded: true,
      changed: true,
      previous_mode: "observe",
      mode: "blocked",
    });
    expect(await transition("observe")).toMatchObject({
      succeeded: true,
      changed: true,
      previous_mode: "blocked",
      mode: "observe",
    });
    expect(await transition("legacy")).toMatchObject({
      succeeded: true,
      changed: true,
      previous_mode: "observe",
      mode: "legacy",
    });

    const projectEvents = await client.query<{
      event_type: string;
      previous_state: string;
      new_state: string;
      correlation_id: string;
    }>(
      `select event_type, previous_state, new_state, correlation_id
       from public.retention_capability_events
       where project_id = $1
       order by occurred_at, id`,
      [PROJECT_ID],
    );
    expect(projectEvents.rows.filter(
      (event) => event.event_type === "project_mode_changed",
    )).toHaveLength(4);
    expect(projectEvents.rows.filter(
      (event) => event.event_type === "project_mode_transition_rejected",
    )).toHaveLength(5);
    expect(projectEvents.rows.every((event) => Boolean(event.correlation_id))).toBe(true);
  });

  it("keeps tenant-scoped reads isolated under RLS", async () => {
    await asUser(OWNER_ID);
    await client.query("savepoint retention_phase1_rls_read");
    await client.query("set local role authenticated");
    const capabilities = await client.query<{ organization_id: string }>(
      "select organization_id from public.organization_capabilities order by organization_id",
    );
    const states = await client.query<{ organization_id: string }>(
      "select organization_id from public.project_retention_workflow_states order by organization_id",
    );
    const events = await client.query<{ organization_id: string }>(
      "select organization_id from public.retention_capability_events order by organization_id",
    );
    await client.query("rollback to savepoint retention_phase1_rls_read");
    await client.query("release savepoint retention_phase1_rls_read");

    expect(capabilities.rows.every((row) => row.organization_id === ORGANIZATION_ID)).toBe(true);
    expect(states.rows.every((row) => row.organization_id === ORGANIZATION_ID)).toBe(true);
    expect(events.rows.every((row) => row.organization_id === ORGANIZATION_ID)).toBe(true);
  });
});
