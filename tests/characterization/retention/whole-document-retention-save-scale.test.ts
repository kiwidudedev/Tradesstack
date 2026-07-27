import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbUrl =
  process.env.RETENTION_DOCUMENT_SAVE_DB_URL
  ?? process.env.RETENTION_PHASE4_DB_URL
  ?? process.env.PAYMENT_CLAIM_CHARACTERIZATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const USER = "fd000000-0000-4000-8000-000000000001";
const ORG = "fd000000-0000-4000-8000-000000000010";
const PROJECT = "fd000000-0000-4000-8000-000000000100";
const CLAIM = "fd000000-0000-4000-8000-000000001000";

describeDatabase("whole-document Retention Claim scale", () => {
  const client = new pg.Client({ connectionString: dbUrl });

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await client.query(
      `insert into auth.users(
        id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
        raw_app_meta_data,raw_user_meta_data
      ) values(
        $1,'00000000-0000-0000-0000-000000000000','authenticated',
        'authenticated','retention-document-scale@example.test','',now(),'{}','{}'
      )`,
      [USER],
    );
    await client.query(
      "delete from public.organizations where created_by=$1",
      [USER],
    );
    await client.query(
      "insert into public.organizations(id,name,created_by) values($1,'Retention Save Scale',$2)",
      [ORG, USER],
    );
    await client.query(
      `insert into public.organization_members(
        organization_id,user_id,role,display_name
      ) values($1,$2,'owner','Retention Scale Owner')`,
      [ORG, USER],
    );
    await client.query(
      `insert into public.organization_projects(
        id,organization_id,created_by,name,slug,project_code
      ) values($1,$2,$3,'Retention Save Scale','retention-save-scale','RSC')`,
      [PROJECT, ORG, USER],
    );
    await client.query(
      `update public.organization_capabilities
       set enabled=true,enabled_by=$2,enabled_at=now()
       where organization_id=$1 and capability_key='retention_management'`,
      [ORG, USER],
    );
    await client.query(
      `update public.project_retention_workflow_states
       set mode='observe',changed_by=$2,changed_at=now()
       where organization_id=$1 and project_id=$3`,
      [ORG, USER, PROJECT],
    );
    await client.query(
      `insert into public.project_claims(
        id,organization_id,project_id,created_by,claim_number,claim_title,
        claim_type,status,claim_date,claim_amount,retention_method,
        retention_percent,retention_withheld_amount,retention_released_amount,
        retention_held_to_date,retention_released_to_date,retention_balance,
        net_claim_excl_gst,gst_amount,total_payable
      )
      select
        ('fd000000-0000-4000-8000-' || lpad(g::text,12,'0'))::uuid,
        $1,$2,$3,'RSC-CL-'||lpad(g::text,3,'0'),'Scale '||g,
        'Progress','Submitted','2026-01-01',100,'flat',10,10,0,10,0,10,
        90,13.5,103.5
      from generate_series(1,500) g`,
      [ORG, PROJECT, USER],
    );
    await client.query(
      `insert into public.retention_claims(
        id,organization_id,project_id,claim_number,title,status,created_by,
        draft_kind
      ) values($1,$2,$3,'RSC-RC-01','Retention Claim','draft',$4,'automatic_rolling')`,
      [CLAIM, ORG, PROJECT, USER],
    );
    await client.query(
      "select set_config('request.jwt.claim.sub',$1,true)",
      [USER],
    );
    await client.query(
      "select set_config('request.jwt.claim.role','authenticated',true)",
    );
    await client.query(
      "select set_config('request.jwt.claim.retention_phase3_internal','true',true)",
    );
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  }, 30_000);

  async function addCandidates(start: number, finish: number) {
    await client.query(
      `insert into public.retention_rolling_draft_origins(
        organization_id,project_id,retention_claim_id,
        originating_payment_claim_id,origin_sequence,
        latest_origin_state_hash,latest_origin_updated_at,latest_retention_owned
      )
      select origin.organization_id,origin.project_id,$1,origin.id,g,
        private.retention_claim_origin_state_hash(origin.id),
        origin.updated_at,greatest(origin.retention_withheld_amount,0)
      from generate_series($2::integer,$3::integer) g
      join public.project_claims origin
        on origin.id=('fd000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid`,
      [CLAIM, start, finish],
    );
  }

  async function save(expectedCount: number, revision: number) {
    const membership = await client.query<{
      result: {
        originSetHash: string;
        originStateHashes: Record<string, string>;
      };
    }>(
      "select public.get_retention_claim_draft_origin_set_hash($1) result",
      [CLAIM],
    );
    const position = await client.query<{ result: { stateHash: string } }>(
      "select public.get_project_retention_position_summary($1) result",
      [PROJECT],
    );
    const eligibility = await client.query<{
      result: { eligibilityStateHash: string };
    }>(
      "select public.get_project_retention_eligibility($1) result",
      [PROJECT],
    );
    const candidates = await client.query<{
      id: string;
      origin_id: string;
      origin_sequence: number;
    }>(
      `select id,originating_payment_claim_id::text origin_id,origin_sequence
       from public.retention_rolling_draft_origins
       where retention_claim_id=$1 order by origin_sequence`,
      [CLAIM],
    );
    expect(candidates.rows).toHaveLength(expectedCount);
    const lines = candidates.rows.map((candidate) => ({
      originatingPaymentClaimId: candidate.origin_id,
      candidateId: candidate.id,
      existingAllocationId: null,
      expectedOriginStateHash:
        membership.rows[0].result.originStateHashes[candidate.origin_id],
      sequence: candidate.origin_sequence,
      proposedAmountCents: 0,
    }));
    const saved = await client.query<{
      result: {
        succeeded: boolean;
        changed: boolean;
        draftRevision: number;
      };
    }>(
      `select public.save_retention_claim_draft_document(
        $1,$2,$3,null,null,null,$4,$5,$6,$7::jsonb,$8
      ) result`,
      [
        CLAIM,
        revision,
        `Scale ${expectedCount}`,
        position.rows[0].result.stateHash,
        eligibility.rows[0].result.eligibilityStateHash,
        membership.rows[0].result.originSetHash,
        JSON.stringify(lines),
        `scale-${expectedCount}`,
      ],
    );
    expect(saved.rows[0].result).toMatchObject({
      succeeded: true,
      changed: true,
    });
    return saved.rows[0].result.draftRevision;
  }

  it("saves 205 and the maximum 500 complete lines without N+1 calls", async () => {
    await addCandidates(1, 205);
    let revision = await save(205, 1);
    await addCandidates(206, 500);
    revision = await save(500, revision);
    expect(revision).toBe(3);
    const events = await client.query<{ count: string }>(
      `select count(*)::text count
       from public.retention_claim_events
       where retention_claim_id=$1 and event_type='draft_document_saved'`,
      [CLAIM],
    );
    expect(events.rows[0].count).toBe("2");
  }, 30_000);
});
