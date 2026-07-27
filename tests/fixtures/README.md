# CRM test fixtures

The canonical fixture data is owned by the HuddleWay app/backend repository:

- `docs/CRM_DATA_DICTIONARY.md`
- `backend/lib/crm_contracts.js`
- `backend/lib/crm_migration_contract.js`
- `backend/lib/direct_invoice_contract.js`
- `backend/scripts/seed_crm_release_fixtures.js`

`crmEmulatorSeed.ts` invokes that authoritative seed script instead of copying a
second schema into the website repository. It refuses to run unless all of the
following are true:

- `FIRESTORE_EMULATOR_HOST` is an explicit loopback host and port;
- the Firebase project ID starts with `demo-`;
- the tenant ID contains an explicit `fixture` or `test` segment.

The default deterministic target is project `demo-huddleway-crm`, tenant
`crm-release-fixture`. No helper in this directory contains production
credentials or a production-capable fallback.
