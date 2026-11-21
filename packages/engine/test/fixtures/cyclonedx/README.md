# CycloneDX schema files, for tests only

Downloaded 21 Nov 2026 from https://github.com/CycloneDX/specification, branch master, folder schema. Licence Apache-2.0.

- bom-1.5.schema.json
- spdx.schema.json
- jsf-0.82.schema.json

bom-1.5.schema.json refers to the other two by relative name. Add both to Ajv before compiling the BOM schema.
Used only by tests. Never imported by src.
