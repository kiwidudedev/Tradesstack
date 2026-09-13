import crypto from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";

const dbUrl = process.env.QA_FOUNDATION_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

describeDatabase("QA foundation hardening database behavior", () => {
  it("rejects stale definitions/cancellation and isolates legacy QA by project", async () => {
    const db = new pg.Client({ connectionString: dbUrl });
    const id = () => crypto.randomUUID();
    const owner = id();
    const inspector = id();
    const outsider = id();
    const otherOwner = id();
    const organization = id();
    const otherOrganization = id();
    const project = id();
    const otherProject = id();
    const foreignProject = id();
    await db.connect();
    await db.query("begin");

    async function asUser(userId: string) {
      await db.query("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [userId]);
      await db.query("select set_config('request.jwt.claim.role','authenticated',true)");
      await db.query("set local role authenticated");
    }

    async function rejected(sql: string, params: unknown[]) {
      const savepoint = `s_${id().replaceAll("-", "")}`;
      await db.query(`savepoint ${savepoint}`);
      try {
        await db.query(sql, params);
        throw new Error("Expected database operation to be rejected.");
      } catch (error) {
        await db.query(`rollback to savepoint ${savepoint}`);
        return error instanceof Error ? error.message : String(error);
      }
    }

    try {
      await db.query(
        `insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
         values
          ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','qa-hardening-owner@example.test','',now(),'{}','{}'),
          ($2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','qa-hardening-inspector@example.test','',now(),'{}','{}'),
          ($3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','qa-hardening-outsider@example.test','',now(),'{}','{}'),
          ($4,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','qa-hardening-other-owner@example.test','',now(),'{}','{}')`,
        [owner, inspector, outsider, otherOwner],
      );
      await db.query("delete from public.organizations where created_by = any($1::uuid[])", [[owner, inspector, outsider, otherOwner]]);
      await db.query(
        "insert into public.organizations(id,name,created_by) values($1,'QA hardening org',$2),($3,'QA hardening other org',$4)",
        [organization, owner, otherOrganization, otherOwner],
      );
      const members = await db.query<{ id: string; user_id: string }>(
        `insert into public.organization_members(organization_id,user_id,role,display_name) values
          ($1,$2,'owner','QA Owner'),($1,$3,'worker','QA Inspector'),($1,$4,'worker','QA Outsider'),
          ($5,$6,'owner','Other Owner') returning id,user_id`,
        [organization, owner, inspector, outsider, otherOrganization, otherOwner],
      );
      await db.query(
        `insert into public.organization_projects(id,organization_id,created_by,name,slug,project_code) values
          ($1,$2,$3,'Authorized project','qa-authorized','QA-A'),
          ($4,$2,$3,'Other project','qa-other','QA-B'),
          ($5,$6,$7,'Foreign project','qa-foreign','QA-F')`,
        [project, organization, owner, otherProject, foreignProject, otherOrganization, otherOwner],
      );
      const memberId = (userId: string) => members.rows.find((row) => row.user_id === userId)!.id;
      await db.query(
        `insert into public.project_members(organization_id,project_id,organization_member_id,is_active,created_by) values
          ($1,$2,$3,true,$4),($1,$5,$6,true,$4)`,
        [organization, project, memberId(inspector), owner, otherProject, memberId(outsider)],
      );

      await asUser(owner);
      const templateId = String((await db.query(
        "select public.create_qa_template_v1($1,'Concurrent template','') id",
        [organization],
      )).rows[0].id);
      expect(Number((await db.query(
        "select public.save_qa_template_definition_v1($1,$2,'Template v2','','draft','[]'::jsonb,1) version",
        [organization, templateId],
      )).rows[0].version)).toBe(2);
      expect(await rejected(
        "select public.save_qa_template_definition_v1($1,$2,'Stale overwrite','','draft','[]'::jsonb,1)",
        [organization, templateId],
      )).toMatch(/updated by someone else/i);
      await db.query("reset role");
      expect((await db.query("select name,definition_version from public.qa_templates where id=$1", [templateId])).rows[0]).toMatchObject({ name: "Template v2", definition_version: 2 });

      await asUser(owner);
      const projectQaId = String((await db.query(
        "select public.create_blank_project_qa_v1($1,$2,'Concurrent project QA','') id",
        [organization, project],
      )).rows[0].id);
      expect(Number((await db.query(
        "select public.save_project_qa_definition_v1($1,$2,$3,'Project QA v2','','draft','[]'::jsonb,1) version",
        [organization, project, projectQaId],
      )).rows[0].version)).toBe(2);
      expect(await rejected(
        "select public.save_project_qa_definition_v1($1,$2,$3,'Stale project overwrite','','draft','[]'::jsonb,1)",
        [organization, project, projectQaId],
      )).toMatch(/updated by someone else/i);
      await db.query("reset role");
      expect((await db.query("select name,definition_version from public.project_qas where id=$1", [projectQaId])).rows[0]).toMatchObject({ name: "Project QA v2", definition_version: 2 });

      const runId = id();
      await db.query(
        `insert into public.project_qa_runs(id,organization_id,project_id,project_qa_id,project_qa_definition_version,definition_snapshot,definition_snapshot_hash,status,title,started_by,start_idempotency_key)
         values($1,$2,$3,$4,2,'{"schemaVersion":1}'::jsonb,$5,'in_progress','Cancellation lock',$6,$7)`,
        [runId, organization, project, projectQaId, "a".repeat(64), owner, id()],
      );
      await db.query("update public.project_qa_runs set lock_version=lock_version+1 where id=$1", [runId]);
      await asUser(owner);
      expect(await rejected(
        "select * from public.cancel_project_qa_run_v1($1,$2,$3,1)",
        [organization, project, runId],
      )).toMatch(/changed since you opened it/i);
      await db.query("reset role");
      expect((await db.query("select status from public.project_qa_runs where id=$1", [runId])).rows[0].status).toBe("in_progress");
      await asUser(owner);
      expect((await db.query(
        "select status,lock_version from public.cancel_project_qa_run_v1($1,$2,$3,2)",
        [organization, project, runId],
      )).rows[0]).toMatchObject({ status: "cancelled", lock_version: 3 });

      await db.query("reset role");
      const issueA = id();
      const issueB = id();
      const foreignIssue = id();
      await db.query(
        `insert into public.project_quality_issues(id,organization_id,project_id,created_by,title) values
          ($1,$2,$3,$4,'Project A issue'),($5,$2,$6,$4,'Project B issue'),($7,$8,$9,$10,'Foreign issue')`,
        [issueA, organization, project, owner, issueB, otherProject, foreignIssue, otherOrganization, foreignProject, otherOwner],
      );

      await asUser(outsider);
      expect(Number((await db.query("select count(*) count from public.project_quality_issues where id=$1", [issueA])).rows[0].count)).toBe(0);
      expect(await rejected(
        "insert into public.project_quality_issues(organization_id,project_id,created_by,title) values($1,$2,$3,'Forbidden')",
        [organization, project, outsider],
      )).toMatch(/row-level security/i);
      expect((await db.query("update public.project_quality_issues set title='Forbidden update' where id=$1", [issueA])).rowCount).toBe(0);
      expect((await db.query("delete from public.project_quality_issues where id=$1", [issueA])).rowCount).toBe(0);

      await asUser(inspector);
      expect(Number((await db.query("select count(*) count from public.project_quality_issues where id=$1", [issueA])).rows[0].count)).toBe(1);
      expect((await db.query(
        "insert into public.project_quality_issues(organization_id,project_id,created_by,title) values($1,$2,$3,'Authorized') returning id",
        [organization, project, inspector],
      )).rowCount).toBe(1);
      expect(Number((await db.query("select count(*) count from public.project_quality_issues where id=$1", [foreignIssue])).rows[0].count)).toBe(0);
      expect(await rejected(
        "insert into public.project_quality_issue_comments(organization_id,project_id,issue_id,created_by,comment) values($1,$2,$3,$4,'Cross project')",
        [organization, project, issueB, inspector],
      )).toMatch(/foreign key/i);

      await asUser(owner);
      expect(Number((await db.query("select count(*) count from public.project_quality_issues where id=$1", [issueA])).rows[0].count)).toBe(1);
      expect(Number((await db.query("select count(*) count from public.project_job_todos where linked_issue_id=$1 and source_type='qa_issue'", [issueA])).rows[0].count)).toBe(1);
      expect((await db.query("delete from public.project_quality_issues where id=$1", [issueA])).rowCount).toBe(1);
    } finally {
      await db.query("reset role");
      await db.query("rollback");
      await db.end();
    }
  }, 30_000);
});
