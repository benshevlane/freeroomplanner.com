# Plan: Replace Logo URL with File Upload (Supabase Storage)

## Current State
- `GetEmbed.tsx`: Text input for logo URL, stored as `logo_url` string in `partners` table
- `embed-params.ts`: Parses `logo_url` query param, validates it's HTTPS
- `Embed.tsx`: Renders `<img src={params.logoUrl}>` in branding strip
- Supabase Storage is **not yet used** in the project (only DB tables)

## Changes Required

### 1. Supabase Storage Setup (manual / migration)
- Create a **public** bucket called `partner-logos` in Supabase dashboard
- Set RLS policy: allow anonymous uploads (since the form has no auth), restrict to image MIME types
- Max file size: **2 MB**
- Allowed types: `image/png`, `image/jpeg`, `image/svg+xml`, `image/webp`

### 2. `GetEmbed.tsx` — Replace URL input with file upload
- **Remove**: `logoUrl` string field from `FormState`, the text input, and blur validation
- **Add**: `logoFile: File | null` to component state (not in FormState since it's not serializable)
- **Add**: A file input styled as a drop zone / button:
  - Accept: `.png, .jpg, .jpeg, .svg, .webp`
  - Show filename + thumbnail preview when selected
  - "Remove" button to clear selection
- **Update `handleSubmit`**:
  1. If `logoFile` is set, upload to Supabase Storage: `supabase.storage.from('partner-logos').upload(`${partnerId}.${ext}`, file)`
  2. Get the public URL: `supabase.storage.from('partner-logos').getPublicUrl(path)`
  3. Store that public URL in `partners.logo_url` (DB column stays the same)
- **Update `buildEmbedSrc` / `buildPreviewSrc`**: Use the Supabase public URL instead of user-typed URL
- **Remove**: Logo URL validation (https:// check) — no longer needed since we control the URL

### 3. `embed-params.ts` — No changes needed
- Still receives a valid HTTPS URL (now from Supabase Storage)
- Existing validation still works

### 4. `Embed.tsx` — No changes needed
- Still renders `<img src={logoUrl}>` — the URL just comes from Supabase now

### 5. Form state flow (updated)

```
User selects file → local preview shown
    ↓
Submit → upload file to Supabase Storage (partner-logos/{partnerId}.png)
    ↓
Get public URL from Supabase
    ↓
Insert into partners table (logo_url = Supabase public URL)
    ↓
Embed code uses that URL in logo_url param
    ↓
Embed.tsx renders <img src="https://xxx.supabase.co/storage/v1/object/public/partner-logos/...">
```

## Files to modify
| File | Change |
|------|--------|
| `client/src/pages/GetEmbed.tsx` | Replace URL input with file upload, upload logic in submit handler |

## Files unchanged
- `client/src/lib/embed-params.ts` — still validates HTTPS URLs
- `client/src/pages/Embed.tsx` — still renders `<img src=...>`
- `client/src/lib/supabase.ts` — already exports the client, `.storage` is available
- `server/` — no server changes needed (Supabase Storage handles serving)

## Risks / Considerations
- **No auth on upload**: Anyone can upload. Mitigate by naming files `{partnerId}.{ext}` (overwrites on re-submit) and keeping the bucket size-limited
- **Bucket must be public** for the embed `<img>` to load without auth
- **Supabase Storage bucket must be created manually** (or via migration SQL) before this code works
