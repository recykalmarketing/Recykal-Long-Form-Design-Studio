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
  "targetPageCount":20,
  "research":true
}
```

## POST /api/v1/projects/:id/export
Scope: `export`

```json
{"format":"pdf","review":false}
```

Final exports require current QC; when the organization approval gate is enabled they also require workflow status `Approved`.

### Optional project palette
Generation requests may include `projectPalette`, an array of up to 8 six-digit HEX strings, for example:

```json
{"projectPalette":["#005DFF","#1DC797","#101828"]}
```

If omitted or empty, the selected Recykal theme palette is used. Project palette colours affect design accents only; logo artwork and typography rules remain locked.


### Optional exact document page target
For `type: "document"`, generation requests may include `targetPageCount` (1–500). If omitted or `null`, document length remains Auto. The exact count includes cover/closing pages and remains subject to A4/readability/source-fidelity gates.
