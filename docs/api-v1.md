# Long Form Design Studio API v1

Authenticate with `Authorization: Bearer lfs_<key>`.

## GET /api/v1/projects
Scope: `read`

## GET /api/v1/projects/:id
Scope: `read`

## POST /api/v1/generate
Scope: `write`

Example JSON:
```json
{
  "type":"document",
  "prompt":"Create a detailed DRS policy report for India",
  "audience":"Policymakers",
  "tone":"Authoritative",
  "deckStyle":"auto",
  "themeId":"recykal-core",
  "imageSource":"mixed",
  "artStyleId":"flat-line",
  "research":true
}
```

## POST /api/v1/projects/:id/export
Scope: `export`

```json
{"format":"pdf","review":false}
```

Final exports require current QC; when the organization approval gate is enabled they also require workflow status `Approved`.
