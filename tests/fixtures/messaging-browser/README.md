# Messaging browser fixture

Run `node tests/fixtures/messaging-browser/serve.mjs` from the website checkout.
Open the printed local URL for desktop or open `/phone.html` for a narrow preview.
This mounts the production messaging components and styles with local sample
records. All message APIs are replaced; sending in the fixture contacts no
customers or providers. Test fixtures are excluded from production bundles.
