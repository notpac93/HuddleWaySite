# Registration and event creation browser fixture

Run `node tests/fixtures/event-creation-browser/serve.mjs` from the website directory.
Open http://127.0.0.1:8881 for Events. Use the Registration forms header button
to switch to the main form section without resetting the session, or open
http://127.0.0.1:8881/?view=forms directly. Events → tools → Saved forms and
the Registration forms section share the same saved form records.

These are the production Svelte components with local in-memory stores and
commands. The fixture cannot read or write tenant cloud data. Saved forms remain
available in the current browser session and can be reopened or selected while
creating event drafts. Refreshing the page resets the sample records.

Try selecting Player, Guardian, Emergency, Medical, Uniform, or Questions;
configure contacts and custom questions; tap the fields under Customize; then
inspect every section in Preview and save. A previous form provides age-group
history, and an archived form is intentionally excluded from event selection.
