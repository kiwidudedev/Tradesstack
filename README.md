# TradesStack App Notes

## Supabase Storage

This project does not currently reference a Supabase Storage bucket named `pdfs` in code. If you plan to store PDF documents, create the following bucket and path structure.

## Hosted Edge Functions

Use hosted Supabase (no local Docker commands).

- Deploy functions:
  - `supabase functions deploy export-variation-pdf`
  - `supabase functions deploy export-document-pdf`
- Set secrets (hosted):
  - `supabase secrets set SUPABASE_URL=...`
  - `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`

### Bucket settings

- Bucket name: `pdfs`
- Public: **false** (private bucket)
- Allowed MIME types: `application/pdf`
- File size limit: use your project default or set an explicit limit appropriate for your PDFs

### Expected path structure

Store PDF files using this path pattern:

```
variations/{documentId}.pdf
```

Example:

```
variations/9f2d4a2b-4d38-4c2b-8e3b-2c5a0d9f0e11.pdf
```
