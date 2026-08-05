import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The release gate is intentionally executable JavaScript so CI and operators
// run the exact same implementation. It exports only its deterministic input
// enumerators for this qualification test.
import {
  backendCanonicalDeletions,
  backendContractInputs,
  canonicalInputs,
  classifyWorktreeStatus,
} from '../../scripts/release/crm-release.mjs';

describe('CRM release input inventory', () => {
  it('includes every live site runtime, test, release, and evidence input group', async () => {
    const inputs = await canonicalInputs();

    expect(inputs).toEqual(expect.arrayContaining([
      '.gitignore',
      '.github/workflows/crm-release-gate.yml',
      '.github/workflows/crm-production-deploy.yml',
      '.github/workflows/crm-owner-production-deploy.yml',
      'scripts/release/crm-external-evidence.mjs',
      'scripts/release/crm-media-evidence.mjs',
      'scripts/release/crm-production-deploy.mjs',
      'scripts/release/crm-single-developer-deploy.mjs',
      'scripts/release/crm-release.mjs',
      'config/crm-performance-budgets.json',
      'src/data/site.ts',
      'src/lib/firebaseStorage.ts',
      'src/lib/finance/crmFinancials.ts',
      'src/lib/performance/crmRum.ts',
      'src/lib/ui/csvExport.ts',
      'src/lib/ui/modalFocus.ts',
      'tests/unit/crm-control-inventory.test.ts',
      'tests/unit/crm-production-deploy.test.ts',
      'docs/CRM_SYSTEM_FILE_AUDIT.md',
      'docs/FEATURE_DEV_SCRIPT__CRM_PRODUCTION_RELEASE.md',
      'docs/YOUTH_SPORTS_CRM_PRODUCT_RESEARCH.md',
      'public/crm-favicon.png',
      'vitest.integration.config.ts',
    ]));
    expect(inputs.some((path: string) => path.startsWith('src/components/crm/'))).toBe(true);
    expect(inputs.some((path: string) => path.startsWith('tests/component/'))).toBe(true);
    expect(inputs.some((path: string) => path.startsWith('tests/e2e/'))).toBe(true);
    expect(inputs.some((path: string) => path.startsWith('src/.astro/'))).toBe(false);
    expect(new Set(inputs).size).toBe(inputs.length);
  });

  it('includes the backend route authority and every backend contract/test module', async () => {
    const backendRoot = resolve(
      process.env.HUDDLEWAY_BACKEND_ROOT
        ?? resolve(process.cwd(), '../../HuddleWay'),
    );
    const inputs = await backendContractInputs(backendRoot);

    expect(inputs).toEqual(expect.arrayContaining([
      'backend/server.js',
      'backend/rate_limit.js',
      'backend/package-lock.json',
      'backend/lib/crm_contracts.js',
      'backend/lib/crm_rum.js',
      'backend/config/crm_release_operations.json',
      'docs/CRM_RELEASE_OPERATIONS_RUNBOOK.md',
      'backend/scripts/collect_crm_rum_evidence.js',
      'backend/scripts/export_backup_bundle.js',
      'backend/scripts/restore_backup_bundle.js',
      'backend/scripts/validate_backup_bundle.js',
      '.github/workflows/crm_rum_evidence.yml',
      'pubspec.yaml',
      'pubspec.lock',
      'lib/firebase_options.dart',
      'lib/main_admin.dart',
      'android/app/build.gradle.kts',
      'android/gradle/wrapper/gradle-wrapper.jar',
      'android/gradlew',
      'android/gradlew.bat',
      'android/app/src/adminDebug/AndroidManifest.xml',
      'ios/Runner/Info.plist',
      'assets/images/branding/google_g_mark.svg',
      'test/core/security/app_check_activation_test.dart',
      'backend/test/crm_privileged_operations.integration.test.js',
      'functions/create_demo.js',
      'functions/crm_audit_triggers.js',
      'functions/cloud_run_metadata.js',
      'functions/index.js',
      'functions/media_optimization.js',
      'functions/native_icon_package.js',
      'functions/native_icon_release.js',
      'functions/package-lock.json',
      'functions/scripts/backfill_media_optimizations.js',
      'functions/scripts/backfill_native_icon_release_requests.js',
      'firestore.rules',
      'firestore.indexes.json',
      'lib/src/core/services/stripe_service.dart',
      'storage.rules',
      'web/terms.html',
    ]));
    expect(inputs.some((path: string) => path.startsWith('lib/src/'))).toBe(true);
    expect(inputs).not.toContain('android/app/src/admin/google-services.json');
    expect(inputs).not.toContain('assets/images/generated/media_.png');
    expect(inputs).not.toContain('ios/Runner/GeneratedPluginRegistrant.h');
    expect(inputs).not.toContain('ios/Runner/GoogleService-Info-admin.plist');
    expect(new Set(inputs).size).toBe(inputs.length);
    expect(backendCanonicalDeletions).toEqual([
      'backend/lib/program_activation_access.js',
      'lib/src/core/services/program_activation_gate_service.dart',
      'lib/src/core/services/program_activation_service.dart',
      'lib/src/features/home/presentation/widgets/about_section.dart',
      'lib/src/features/home/presentation/widgets/news_section.dart',
      'lib/src/features/onboarding/presentation/program_activation_checkout_screen.dart',
      'lib/src/features/onboarding/presentation/program_activation_payment_screen.dart',
      'lib/src/features/onboarding/presentation/program_activation_screen.dart',
      'lib/src/features/teams/presentation/widgets/team_page_template.dart',
      'test/program_activation_checkout_screen_test.dart',
      'test/program_activation_screen_test.dart',
    ]);
    expect(backendCanonicalDeletions).not.toContain(
      'lib/src/features/admin/presentation/widgets/admin_messaging_tab.dart.bak',
    );
  });

  it('separates canonical changes from unrelated work without mutating Git state', () => {
    const result = classifyWorktreeStatus(
      [
        ' M scripts/release/crm-release.mjs',
        '?? src/components/crm/Login.svelte',
        ' M unrelated-user-file.md',
        '?? scratch/private-note.txt',
      ],
      [
        ' M scripts/release/crm-release.mjs',
        '?? src/components/crm/Login.svelte',
      ],
    );

    expect(result).toEqual({
      canonical: [
        ' M scripts/release/crm-release.mjs',
        '?? src/components/crm/Login.svelte',
      ],
      unrelated: [
        ' M unrelated-user-file.md',
        '?? scratch/private-note.txt',
      ],
    });
  });
});
