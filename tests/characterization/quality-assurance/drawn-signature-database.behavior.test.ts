import crypto from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";

const dbUrl = process.env.QA_SIGNATURE_DB_URL;
const describeDatabase = dbUrl ? describe.sequential : describe.skip;

const metadata = {
  schemaVersion: 1, rendererVersion: 1, mimeType: "image/png",
  logicalWidth: 600, logicalHeight: 200, pixelWidth: 1200, pixelHeight: 400, devicePixelRatio: 2,
  strokeCount: 1, pointCount: 4, totalDistance: 200,
  bounds: { x: 20, y: 40, width: 300, height: 80 },
};

describeDatabase("Project QA drawn signature database behavior", () => {
  it("preserves typed support and atomically finalizes, replaces, completes, and freezes drawn signatures", async () => {
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    await client.query("begin");
    try {
      const fixture = await client.query<{ actor: string; organization_id: string; display_name: string; project_id: string }>(`
        select member.user_id actor,member.organization_id,member.display_name,project.id project_id
        from public.organization_members member
        join public.organization_projects project on project.organization_id=member.organization_id
        order by member.created_at,project.created_at limit 1
      `);
      if (!fixture.rowCount) throw new Error("The QA signature database test needs one qa.inspect member and project fixture.");
      const { actor, organization_id: organizationId, display_name: actorName, project_id: projectId } = fixture.rows[0];
      const qaId = crypto.randomUUID();
      const runId = crypto.randomUUID();
      const cancelledRunId = crypto.randomUUID();
      const responseId = crypto.randomUUID();
      const cancelledResponseId = crypto.randomUUID();
      const sectionId = crypto.randomUUID();
      const fieldId = crypto.randomUUID();
      const snapshot = { id: fieldId, sectionId, fieldType: "signature", label: "Signature", required: true, minimumPhotos: 0 };
      await client.query(`insert into public.project_qas(id,organization_id,project_id,name,status,created_by,updated_by) values($1,$2,$3,'Signature acceptance','active',$4,$4)`, [qaId, organizationId, projectId, actor]);
      for (const [id, status] of [[runId, "in_progress"], [cancelledRunId, "cancelled"]] as const) {
        await client.query(`insert into public.project_qa_runs(id,organization_id,project_id,project_qa_id,project_qa_definition_version,definition_snapshot,definition_snapshot_hash,status,title,started_by,start_idempotency_key,cancelled_by,cancelled_at) values($1,$2,$3,$4,1,$5,$6,$7,'Signature acceptance',$8,$9,case when $7='cancelled' then $8::uuid end,case when $7='cancelled' then now() end)`, [id, organizationId, projectId, qaId, { schemaVersion: 1 }, "a".repeat(64), status, actor, crypto.randomUUID()]);
      }
      for (const [id, parentRun] of [[responseId, runId], [cancelledResponseId, cancelledRunId]]) {
        await client.query(`insert into public.project_qa_responses(id,organization_id,project_id,run_id,captured_section_id,captured_field_id,section_sort_order,field_sort_order,field_type,field_snapshot,updated_by) values($1,$2,$3,$4,$5,$6,0,0,'signature',$7,$8)`, [id, organizationId, projectId, parentRun, sectionId, crypto.randomUUID(), snapshot, actor]);
      }

      expect((await client.query("select public.qa_signature_metadata_is_valid_v1($1) valid", [metadata])).rows[0].valid).toBe(true);
      expect((await client.query("select public.qa_signature_metadata_is_valid_v1($1) valid", [{ ...metadata, pointCount: "bad" }])).rows[0].valid).toBe(false);

      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
      await client.query("select set_config('request.jwt.claim.role','authenticated',true)");
      await client.query("set local role authenticated");
      expect((await client.query("select public.can_access_qa_project($1,$2,'qa.inspect') allowed", [organizationId, projectId])).rows[0].allowed).toBe(true);

      async function rejected(sql: string, params: unknown[]) {
        const savepoint = `s_${crypto.randomUUID().replaceAll("-", "")}`;
        await client.query(`savepoint ${savepoint}`);
        try {
          await client.query(sql, params);
          throw new Error("Expected database operation to be rejected.");
        } catch (error) {
          await client.query(`rollback to savepoint ${savepoint}`);
          return error instanceof Error ? error.message : String(error);
        }
      }

      expect(await rejected("select * from public.initiate_project_qa_evidence_upload_v1($1,$2,$3,$4,'signature','general','signature.png','image/jpeg',1000,$5)", [organizationId, projectId, runId, responseId, crypto.randomUUID()])).toMatch(/Unsupported/);
      expect(await rejected("select * from public.initiate_project_qa_evidence_upload_v1($1,$2,$3,$4,'signature','general','signature.png','image/png',2097153,$5)", [organizationId, projectId, runId, responseId, crypto.randomUUID()])).toMatch(/2 MB/);
      expect(await rejected("select * from public.initiate_project_qa_evidence_upload_v1($1,$2,$3,$4,'signature','general','signature.png','image/png',1000,$5)", [crypto.randomUUID(), projectId, runId, responseId, crypto.randomUUID()])).toMatch(/authorized/);
      expect(await rejected("select * from public.initiate_project_qa_evidence_upload_v1($1,$2,$3,$4,'signature','general','signature.png','image/png',1000,$5)", [organizationId, projectId, runId, crypto.randomUUID(), crypto.randomUUID()])).toMatch(/response not found/i);
      expect(await rejected("select * from public.sign_project_qa_response_v1($1,$2,$3,$4,'Cancelled signer','Attestation')", [organizationId, projectId, cancelledRunId, cancelledResponseId])).toMatch(/in-progress/);

      await client.query("select * from public.sign_project_qa_response_v1($1,$2,$3,$4,'Typed signer','Typed attestation')", [organizationId, projectId, runId, responseId]);
      const typed = (await client.query("select signature_method,signature_evidence_id,signature_recorded_by_name from public.project_qa_responses where id=$1", [responseId])).rows[0];
      expect(typed).toMatchObject({ signature_method: "typed_acknowledgement", signature_evidence_id: null, signature_recorded_by_name: actorName });

      async function reserveAndMaterialize(byteSize = 1000) {
        const reserved = (await client.query<{ upload_id: string; storage_path: string }>("select * from public.initiate_project_qa_evidence_upload_v1($1,$2,$3,$4,'signature','general','signature.png','image/png',$5,$6)", [organizationId, projectId, runId, responseId, byteSize, crypto.randomUUID()])).rows[0];
        await client.query("reset role");
        await client.query("insert into storage.objects(bucket_id,name,owner,metadata) values('project-qa-evidence',$1,$2,$3)", [reserved.storage_path, actor, { size: byteSize, mimetype: "image/png" }]);
        await client.query("set local role authenticated");
        return reserved;
      }

      const first = await reserveAndMaterialize();
      const firstHash = "b".repeat(64);
      const before = Date.now();
      await client.query("select * from public.finalize_drawn_project_qa_signature_v1($1,'John Smith','Drawn attestation',$2,$3,1200,400)", [first.upload_id, firstHash, metadata]);
      const firstSaved = (await client.query("select signature_method,signature_signer_name,signature_artifact_sha256,signature_recorded_by_name,signature_signed_at,signature_evidence_id from public.project_qa_responses where id=$1", [responseId])).rows[0];
      expect(firstSaved).toMatchObject({ signature_method: "drawn_signature", signature_signer_name: "John Smith", signature_artifact_sha256: firstHash, signature_recorded_by_name: actorName });
      expect(new Date(firstSaved.signature_signed_at).getTime()).toBeGreaterThanOrEqual(before);
      const firstEvidenceId = firstSaved.signature_evidence_id;

      const second = await reserveAndMaterialize(1100);
      const secondHash = "c".repeat(64);
      await client.query("select * from public.finalize_drawn_project_qa_signature_v1($1,'Jane Smith','Replacement attestation',$2,$3,1200,400)", [second.upload_id, secondHash, metadata]);
      const replaced = (await client.query("select signature_evidence_id,signature_artifact_sha256 from public.project_qa_responses where id=$1", [responseId])).rows[0];
      expect(replaced.signature_evidence_id).not.toBe(firstEvidenceId);
      expect(replaced.signature_artifact_sha256).toBe(secondHash);
      expect(Number((await client.query("select count(*) count from public.project_qa_response_evidence where project_qa_response_id=$1 and evidence_type='signature'", [responseId])).rows[0].count)).toBe(2);

      const failed = await reserveAndMaterialize(1200);
      expect(await rejected("select * from public.finalize_drawn_project_qa_signature_v1($1,'Failed replacement','Attestation',$2,$3,1200,400)", [failed.upload_id, "d".repeat(64), { ...metadata, pointCount: 1 }])).toMatch(/metadata/);
      const retained = (await client.query("select signature_evidence_id,signature_artifact_sha256 from public.project_qa_responses where id=$1", [responseId])).rows[0];
      expect(retained).toEqual(replaced);
      await client.query("select public.abandon_project_qa_evidence_upload_v1($1)", [failed.upload_id]);

      const runLock = (await client.query("select lock_version from public.project_qa_runs where id=$1", [runId])).rows[0].lock_version;
      await client.query("select * from public.complete_project_qa_run_v1($1,$2,$3,$4)", [organizationId, projectId, runId, runLock]);
      expect((await client.query("select status from public.project_qa_runs where id=$1", [runId])).rows[0].status).toBe("completed");
      expect(await rejected("select * from public.sign_project_qa_response_v1($1,$2,$3,$4,'Late signer','Attestation')", [organizationId, projectId, runId, responseId])).toMatch(/in-progress/);
      await client.query("reset role");
      expect(await rejected("update public.project_qa_response_evidence set caption='changed' where id=$1", [replaced.signature_evidence_id])).toMatch(/immutable/);
    } finally {
      await client.query("rollback");
      await client.query("reset role");
      await client.end();
    }
  }, 30_000);
});
