import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { Upload } from "tus-js-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DOCUMENT_STORAGE_BUCKET,
  DOCUMENT_TUS_CHUNK_SIZE_BYTES,
} from "@/lib/documents/constants";
import type { Database } from "@/lib/supabase/types";

const apiUrl = process.env.DOCUMENT_STORAGE_INTEGRATION_URL;
const anonKey = process.env.DOCUMENT_STORAGE_INTEGRATION_ANON_KEY;
const serviceRoleKey = process.env.DOCUMENT_STORAGE_INTEGRATION_SERVICE_ROLE_KEY;
const dbUrl = process.env.DOCUMENT_STORAGE_DB_URL;
const enabled = apiUrl && anonKey && serviceRoleKey && dbUrl;
const describeIntegration = enabled ? describe.sequential : describe.skip;

interface Reservation {
  node_id: string;
  version_id: string;
  version_number: number;
  storage_key: string;
  upload_state: string;
  upload_expires_at: string;
  display_name: string;
  claimed_mime_type: string;
  byte_size: number;
}

describeIntegration("document Storage local TUS and RLS integration", () => {
  const setup = new pg.Client({ connectionString: dbUrl });
  const admin = createClient<Database>(apiUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let ownerA: SupabaseClient<Database>;
  let ownerB: SupabaseClient<Database>;
  let ownerAId = "";
  let ownerBId = "";
  let opportunityA = "";
  let opportunityB = "";
  const organizationA = crypto.randomUUID();
  const organizationB = crypto.randomUUID();
  const uploadedKeys = new Set<string>();

  beforeAll(async () => {
    await setup.connect();
    const suffix = crypto.randomUUID();
    const password = "Document-storage-test-Password-123!";
    const [createdA, createdB] = await Promise.all([
      admin.auth.admin.createUser({
        email: `document-storage-a-${suffix}@example.test`,
        password,
        email_confirm: true,
      }),
      admin.auth.admin.createUser({
        email: `document-storage-b-${suffix}@example.test`,
        password,
        email_confirm: true,
      }),
    ]);
    if (createdA.error || !createdA.data.user || createdB.error || !createdB.data.user) {
      throw createdA.error ?? createdB.error ?? new Error("Unable to create Storage test users.");
    }
    ownerAId = createdA.data.user.id;
    ownerBId = createdB.data.user.id;
    opportunityA = crypto.randomUUID();
    opportunityB = crypto.randomUUID();

    await setup.query(
      "delete from public.organizations where created_by = any($1::uuid[])",
      [[ownerAId, ownerBId]],
    );
    await setup.query(
      `insert into public.organizations(id,name,created_by)
       values($1,'Storage Integration A',$3),($2,'Storage Integration B',$4)`,
      [organizationA, organizationB, ownerAId, ownerBId],
    );
    await setup.query(
      `insert into public.organization_members(
        organization_id,user_id,role,display_name
      ) values($1,$3,'owner','Storage A'),($2,$4,'owner','Storage B')`,
      [organizationA, organizationB, ownerAId, ownerBId],
    );
    await setup.query(
      `insert into public.organization_opportunities(
        id,organization_id,created_by,name,slug
      ) values($1::uuid,$3,$5,'Storage Integration A',($1::uuid)::text),
              ($2::uuid,$4,$6,'Storage Integration B',($2::uuid)::text)`,
      [opportunityA, opportunityB, organizationA, organizationB, ownerAId, ownerBId],
    );

    ownerA = createClient<Database>(apiUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    ownerB = createClient<Database>(apiUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const [signedA, signedB] = await Promise.all([
      ownerA.auth.signInWithPassword({
        email: createdA.data.user.email!,
        password,
      }),
      ownerB.auth.signInWithPassword({
        email: createdB.data.user.email!,
        password,
      }),
    ]);
    if (signedA.error || signedB.error) {
      throw signedA.error ?? signedB.error;
    }
  }, 30_000);

  afterAll(async () => {
    if (uploadedKeys.size > 0) {
      await admin.storage.from(DOCUMENT_STORAGE_BUCKET).remove([...uploadedKeys]);
    }
    await setup.query("set session_replication_role=replica");
    for (const table of [
      "document_activity_events",
      "document_storage_cleanup_jobs",
      "document_versions",
      "document_nodes",
      "document_workspace_entities",
      "document_workspaces",
    ]) {
      await setup.query(
        `delete from public.${table} where organization_id = any($1::uuid[])`,
        [[organizationA, organizationB]],
      );
    }
    const opportunityIds = [opportunityA, opportunityB].filter(Boolean);
    if (opportunityIds.length > 0) {
      await setup.query(
        "delete from public.organization_opportunities where id=any($1::uuid[])",
        [opportunityIds],
      );
    }
    await setup.query(
      "delete from public.organization_members where organization_id=any($1::uuid[])",
      [[organizationA, organizationB]],
    );
    await setup.query(
      "delete from public.organizations where id=any($1::uuid[])",
      [[organizationA, organizationB]],
    );
    await setup.query("set session_replication_role=origin");
    await setup.end();
    await Promise.all([
      ownerAId ? admin.auth.admin.deleteUser(ownerAId) : Promise.resolve(),
      ownerBId ? admin.auth.admin.deleteUser(ownerBId) : Promise.resolve(),
    ]);
  }, 30_000);

  async function initiate(params: {
    client?: SupabaseClient<Database>;
    opportunityId?: string;
    name?: string;
    size: number;
    idempotencyKey?: string;
  }) {
    const client = params.client ?? ownerA;
    const idempotencyKey = params.idempotencyKey ?? crypto.randomUUID();
    const args = {
      p_opportunity_id: params.opportunityId ?? opportunityA,
      p_project_id: null,
      p_parent_node_id: null,
      p_display_name: params.name ?? `${idempotencyKey}.pdf`,
      p_claimed_mime_type: "application/pdf",
      p_file_extension: "pdf",
      p_byte_size: params.size,
      p_existing_node_id: null,
      p_idempotency_key: idempotencyKey,
    } as unknown as Database["public"]["Functions"]["initiate_document_upload"]["Args"];
    const { data, error } = await client.rpc("initiate_document_upload", args);
    if (error || !data?.[0]) {
      throw error ?? new Error("No upload reservation returned.");
    }
    return data[0] as Reservation;
  }

  async function accessToken(client: SupabaseClient<Database>) {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.access_token) {
      throw error ?? new Error("Missing test access token.");
    }
    return data.session.access_token;
  }

  async function tusUpload(params: {
    client: SupabaseClient<Database>;
    reservation: Reservation;
    bytes: Buffer;
    uploadUrl?: string;
    stopAfterFirstChunk?: boolean;
  }): Promise<{ uploadUrl: string }> {
    const token = await accessToken(params.client);
    return new Promise((resolve, reject) => {
      let stopped = false;
      const upload = new Upload(params.bytes, {
        endpoint: `${apiUrl}/storage/v1/upload/resumable`,
        uploadUrl: params.uploadUrl,
        retryDelays: [0, 100, 300],
        chunkSize: DOCUMENT_TUS_CHUNK_SIZE_BYTES,
        uploadDataDuringCreation: false,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: DOCUMENT_STORAGE_BUCKET,
          objectName: params.reservation.storage_key,
          contentType: params.reservation.claimed_mime_type,
          cacheControl: "0",
        },
        headers: {
          authorization: `Bearer ${token}`,
          apikey: anonKey!,
          "x-upsert": "false",
        },
        onChunkComplete: (_chunkSize, accepted) => {
          if (
            params.stopAfterFirstChunk
            && !stopped
            && accepted >= DOCUMENT_TUS_CHUNK_SIZE_BYTES
            && accepted < params.bytes.length
          ) {
            stopped = true;
            void upload.abort(false).then(() => {
              if (!upload.url) {
                reject(new Error("TUS did not expose a resumable URL."));
                return;
              }
              resolve({ uploadUrl: upload.url });
            }, reject);
          }
        },
        onError: reject,
        onSuccess: () => {
          if (!upload.url) {
            reject(new Error("TUS upload completed without a URL."));
            return;
          }
          resolve({ uploadUrl: upload.url });
        },
      });
      upload.start();
    });
  }

  it("configures a private 2 GiB bucket with the launch MIME allowlist", async () => {
    const bucket = await setup.query(
      `select public,file_size_limit,allowed_mime_types
       from storage.buckets where id=$1`,
      [DOCUMENT_STORAGE_BUCKET],
    );
    expect(bucket.rows[0].public).toBe(false);
    expect(Number(bucket.rows[0].file_size_limit)).toBe(2 * 1024 * 1024 * 1024);
    expect(bucket.rows[0].allowed_mime_types).toContain("application/pdf");
  });

  it("rejects arbitrary, forged, cross-organization, and expired uploads", async () => {
    const arbitrary = await ownerA.storage
      .from(DOCUMENT_STORAGE_BUCKET)
      .upload(`${organizationA}/${crypto.randomUUID()}/${crypto.randomUUID()}`, Buffer.from("x"), {
        contentType: "application/pdf",
        upsert: false,
      });
    expect(arbitrary.error).toBeTruthy();

    const reservation = await initiate({ size: 5 });
    const crossOrg = await ownerB.storage
      .from(DOCUMENT_STORAGE_BUCKET)
      .upload(reservation.storage_key, Buffer.from("12345"), {
        contentType: "application/pdf",
        upsert: false,
      });
    expect(crossOrg.error).toBeTruthy();

    const expired = await initiate({ size: 5, name: "Expired Integration.pdf" });
    await setup.query("set session_replication_role=replica");
    await setup.query(
      "update public.document_versions set upload_expires_at=now()-interval '1 minute' where id=$1",
      [expired.version_id],
    );
    await setup.query("set session_replication_role=origin");
    const expiredUpload = await ownerA.storage
      .from(DOCUMENT_STORAGE_BUCKET)
      .upload(expired.storage_key, Buffer.from("12345"), {
        contentType: "application/pdf",
        upsert: false,
      });
    expect(expiredUpload.error).toBeTruthy();
  });

  it("uploads through TUS, prevents overwrite/delete/update/listing, and activates server-side", async () => {
    const bytes = Buffer.from("%PDF-1.7\nsmall integration fixture\n");
    const reservation = await initiate({ size: bytes.length });
    await tusUpload({ client: ownerA, reservation, bytes });
    uploadedKeys.add(reservation.storage_key);

    const overwrite = await tusUpload({
      client: ownerA,
      reservation,
      bytes,
    }).then(() => null, (error: unknown) => error);
    expect(overwrite).toBeTruthy();

    const directUpdate = await ownerA.storage
      .from(DOCUMENT_STORAGE_BUCKET)
      .update(reservation.storage_key, bytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    expect(directUpdate.error).toBeTruthy();
    const directDelete = await ownerA.storage
      .from(DOCUMENT_STORAGE_BUCKET)
      .remove([reservation.storage_key]);
    expect(directDelete.data ?? []).toEqual([]);
    const objectAfterDeleteAttempt = await admin.storage
      .from(DOCUMENT_STORAGE_BUCKET)
      .exists(reservation.storage_key);
    expect(objectAfterDeleteAttempt.error).toBeNull();
    expect(objectAfterDeleteAttempt.data).toBe(true);
    const directList = await ownerA.storage.from(DOCUMENT_STORAGE_BUCKET).list();
    expect(directList.data).toEqual([]);

    const beforeObject = await admin
      .rpc("complete_document_upload", {
        p_version_id: crypto.randomUUID(),
        p_actor_user_id: ownerAId,
      });
    expect(beforeObject.error).toBeTruthy();

    const completed = await admin.rpc("complete_document_upload", {
      p_version_id: reservation.version_id,
      p_actor_user_id: ownerAId,
    });
    expect(completed.error).toBeNull();
    expect(completed.data?.[0]).toMatchObject({
      node_id: reservation.node_id,
      version_id: reservation.version_id,
      verified_mime_type: "application/pdf",
    });
  }, 30_000);

  it("resumes an interrupted multi-chunk TUS upload at the reserved immutable key", async () => {
    const bytes = Buffer.alloc(DOCUMENT_TUS_CHUNK_SIZE_BYTES + 1024, 0x41);
    bytes.write("%PDF-1.7\n", 0, "ascii");
    const reservation = await initiate({
      size: bytes.length,
      name: "Resumable Integration.pdf",
    });
    const interrupted = await tusUpload({
      client: ownerA,
      reservation,
      bytes,
      stopAfterFirstChunk: true,
    });
    await tusUpload({
      client: ownerA,
      reservation,
      bytes,
      uploadUrl: interrupted.uploadUrl,
    });
    uploadedKeys.add(reservation.storage_key);

    const completed = await admin.rpc("complete_document_upload", {
      p_version_id: reservation.version_id,
      p_actor_user_id: ownerAId,
    });
    expect(completed.error).toBeNull();
    expect(Number(completed.data?.[0]?.byte_size)).toBe(bytes.length);
  }, 30_000);

  it("keeps public access closed and creates downloads only after document authorization", async () => {
    const bytes = Buffer.from("%PDF-1.7\ndownload fixture\n");
    const reservation = await initiate({
      size: bytes.length,
      name: "Download Integration.pdf",
    });
    await tusUpload({ client: ownerA, reservation, bytes });
    uploadedKeys.add(reservation.storage_key);
    await admin.rpc("complete_document_upload", {
      p_version_id: reservation.version_id,
      p_actor_user_id: ownerAId,
    });

    const unauthorizedSigned = await ownerB.storage
      .from(DOCUMENT_STORAGE_BUCKET)
      .createSignedUrl(reservation.storage_key, 300);
    expect(unauthorizedSigned.error).toBeTruthy();

    const publicResponse = await fetch(
      `${apiUrl}/storage/v1/object/public/${DOCUMENT_STORAGE_BUCKET}/${reservation.storage_key}`,
    );
    expect(publicResponse.ok).toBe(false);

    const resolved = await ownerA.rpc("resolve_document_download", {
      p_node_id: reservation.node_id,
    });
    expect(resolved.error).toBeNull();
    const signed = await admin.storage
      .from(DOCUMENT_STORAGE_BUCKET)
      .createSignedUrl(resolved.data![0].storage_key, 300, {
        download: resolved.data![0].display_name,
      });
    expect(signed.error).toBeNull();
    const downloaded = await fetch(signed.data!.signedUrl);
    expect(downloaded.ok).toBe(true);
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(bytes);
  }, 30_000);
});
