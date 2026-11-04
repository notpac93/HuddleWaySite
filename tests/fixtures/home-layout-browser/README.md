# Local My App editing preview

The preview can run the **normal `lib/main_consumer.dart` app** inside the production MyAppStudio controls. Its sample public responses and admin writes stay local. No production authentication or publication is exercised.

## Real app (preferred)

From the repository root, run `bash website/tests/fixtures/home-layout-browser/build-consumer.sh`. The development capture build uses the existing local Firestore emulator at port 8181 and Auth emulator at 9099; override `CAPTURE_FIRESTORE_PORT` / `CAPTURE_AUTH_PORT` when your local stack uses different ports. Keep those emulators running. The build does not start or replace another developer's services.

Then, from `website/`, keep both commands running in separate terminals:

```sh
node tests/fixtures/home-layout-browser/serve-consumer.mjs
REAL_CONSUMER_PREVIEW_URL=http://127.0.0.1:8893 node tests/fixtures/home-layout-browser/serve.mjs
```

Both hosts synchronize the sample library with the canonical backend component catalog on startup, retaining sample wording. Every non-hero definition is available, including Text Block; heroes are excluded from insertion.

Open [My App](http://127.0.0.1:8892). Choose **Edit**, select outlined wording, type, then use inline Done/Cancel. Use the hero's plus or a section insertion point to choose a component, preview it, and confirm **Add here**. Section menus move or remove components. Undo and Review stay above the same preview. Home, Schedule, and Board use the actual app routes and persistent bottom tabs. Board includes an authored welcome section; Schedule retains its native screen and currently has no editable wording. Appearance and navigation settings are in the Edit toolbar’s More menu.

The parent runs on 8892 and the actual Flutter consumer app on 8893. The consumer host serves a small public sample API from `content.json`; it rejects mutations and unrelated tenants. The admin authoring API stays in memory. This validates the real rendering/bridge interaction with sample data, not production permissions, persistence, stage publication, or physical-device behavior. The local build is explicitly identified as `local-canvas-20261102` and contains current working-directory sources.

## Schematic fallback

Run only `node tests/fixtures/home-layout-browser/serve.mjs` without the real-consumer environment variable to use the explicitly labeled schematic receiver. This mode is useful for quick portal-control checks but does not establish Flutter parity.

`/mobile.html` embeds the editor in a 390×844 browser viewport. This is responsive inspection, not a physical-device test.
