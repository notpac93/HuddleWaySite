# Event creation browser fixture

Run `node tests/fixtures/event-creation-browser/serve.mjs` from the website directory.
Open http://127.0.0.1:8881. Production event components use local in-memory stores
and commands; this fixture never reads or writes tenant cloud data. Create a
repeating event, attach the sample season, choose a local cover photo, and save
to inspect the grouped event and each individual session.
