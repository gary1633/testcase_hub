import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { count } = require('drizzle-orm');
const {
  isPrivateOrReservedIp,
  validateSafeExternalUrl,
} = require('../dist/common/url-security.util');
const { SlidingWindowRateLimiter } = require('../dist/common/rate-limiter.util');
const { escapeCsvCell, parseCsv, toCsv } = require('../dist/test-cases/csv.util');
const { parseJunitXml, parsePlaywrightJson } = require('../dist/ci/ci.service');
const { createDbConnection } = require('../dist/db/client');
const { resolveSeedMode, seedDatabaseIfEmpty } = require('../dist/db/seed-data');
const { MailService, escapeHtml, isSmtpConfigured } = require('../dist/mail/mail.service');
const {
  isGoogleAuthEnabled,
  isGoogleEmailAllowed,
  resolveGoogleDefaultRole,
} = require('../dist/auth/auth.service');
const {
  canCreateUsers,
  canEditCases,
  canManageAllUsers,
  canManageProject,
  canResetPasswordFor,
  canViewAllProjects,
  creatableRolesFor,
} = require('@tcms/shared');
const schema = require('../dist/db/schema');

test('URL security guard allows valid HTTPS URLs and blocks SSRF/XSS vectors', () => {
  assert.equal(
    validateSafeExternalUrl('https://finx.atlassian.net///', 'Jira URL'),
    'https://finx.atlassian.net',
  );
  assert.equal(isPrivateOrReservedIp('127.0.0.1'), true);
  assert.equal(isPrivateOrReservedIp('169.254.169.254'), true);
  assert.equal(isPrivateOrReservedIp('10.0.0.5'), true);
  assert.equal(isPrivateOrReservedIp('192.168.1.10'), true);
  assert.equal(isPrivateOrReservedIp('::1'), true);
  assert.equal(isPrivateOrReservedIp('8.8.8.8'), false);

  for (const bad of [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'http://localhost:3001/api',
    'http://127.0.0.1:8080/hook',
    'http://169.254.169.254/latest/meta-data',
    'https://user:pass@example.com/hook',
  ]) {
    assert.throws(() => validateSafeExternalUrl(bad, 'Test URL'));
  }
});

test('CSV utility neutralizes formula injection and round-trips quoted values', () => {
  assert.equal(escapeCsvCell('=CMD|"/C calc"!A0'), '"\'=CMD|""/C calc""!A0"');
  assert.equal(escapeCsvCell('+SUM(A1:A5)'), "'+SUM(A1:A5)");
  assert.equal(escapeCsvCell('-2+3'), "'-2+3");
  assert.equal(escapeCsvCell('@IMPORTXML()'), "'@IMPORTXML()");
  assert.equal(escapeCsvCell('Normal title'), 'Normal title');

  const csv = toCsv(['Code', 'Title'], [['FINX-1', 'Hello, "FinX"']]);
  const parsed = parseCsv(csv);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[1], ['FINX-1', 'Hello, "FinX"']);
});

test('SlidingWindowRateLimiter enforces max requests and throws 429', () => {
  const limiter = new SlidingWindowRateLimiter();
  limiter.check('ip:1', 2, 60_000, 'Too many');
  limiter.check('ip:1', 2, 60_000, 'Too many');
  assert.throws(
    () => limiter.check('ip:1', 2, 60_000, 'Too many'),
    (err) => err && err.getStatus?.() === 429,
  );
  // Separate key is unaffected
  assert.doesNotThrow(() => limiter.check('ip:2', 2, 60_000, 'Too many'));
});

test('CI parsers handle Playwright JSON and JUnit XML accurately', () => {
  const pw = parsePlaywrightJson({
    suites: [
      {
        title: 'Auth',
        specs: [
          {
            title: 'FINX-12 Login success',
            ok: true,
            tests: [{ projectName: 'chromium', results: [{ status: 'passed', duration: 310 }] }],
          },
          {
            title: 'FINX-13 Invalid OTP',
            ok: false,
            tests: [
              {
                projectName: 'chromium',
                results: [{ status: 'failed', duration: 500, error: { message: 'OTP mismatch' } }],
              },
            ],
          },
          {
            title: 'Biometric skipped',
            tests: [{ results: [{ status: 'skipped' }] }],
          },
        ],
      },
    ],
  });

  assert.equal(pw.length, 3);
  assert.equal(pw[0].status, 'PASSED');
  assert.equal(pw[1].status, 'FAILED');
  assert.match(pw[1].actualResult, /OTP mismatch/);
  assert.equal(pw[2].status, 'NOT_TEST');

  const junit = parseJunitXml(`<?xml version="1.0"?>
    <testsuites>
      <testsuite name="Payments">
        <testcase classname="Transfer" name="FINX-20 Transfer OK" time="0.4"/>
        <testcase classname="Transfer" name="FINX-21 Insufficient balance" time="0.8">
          <failure message="Expected 400"><![CDATA[Got 500 & crash]]></failure>
        </testcase>
        <testcase classname="Transfer" name="Maintenance mode"><skipped message="Disabled"/></testcase>
      </testsuite>
    </testsuites>`);

  assert.equal(junit.length, 3);
  assert.equal(junit[0].status, 'PASSED');
  assert.equal(junit[1].status, 'FAILED');
  assert.match(junit[1].actualResult, /Expected 400/);
  assert.match(junit[1].actualResult, /Got 500 & crash/);
  assert.equal(junit[2].status, 'NOT_TEST');
});

test('resolveSeedMode defaults to superadmin in production and clean bootstrap seeds only 1 Super Admin', async () => {
  const prevEnv = {
    NODE_ENV: process.env.NODE_ENV,
    SEED_MODE: process.env.SEED_MODE,
    SUPERADMIN_EMAIL: process.env.SUPERADMIN_EMAIL,
    SUPERADMIN_PASSWORD: process.env.SUPERADMIN_PASSWORD,
    SUPERADMIN_NAME: process.env.SUPERADMIN_NAME,
  };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcms-unit-pg-'));
  try {
    delete process.env.SEED_MODE;
    process.env.NODE_ENV = 'production';
    assert.equal(resolveSeedMode(), 'superadmin');

    process.env.NODE_ENV = 'development';
    assert.equal(resolveSeedMode(), 'demo');

    process.env.SEED_MODE = 'none';
    assert.equal(resolveSeedMode(), 'none');

    process.env.SUPERADMIN_EMAIL = 'superadmin@finx.vn';
    process.env.SUPERADMIN_PASSWORD = 'StrongTestPassword@2026!';
    process.env.SUPERADMIN_NAME = 'FinX Root Admin';

    const conn = await createDbConnection(`pglite://${tmpDir.replace(/\\/g, '/')}`);
    try {
      const first = await seedDatabaseIfEmpty(conn.db, 'superadmin');
      assert.equal(first, 'superadmin');

      // Second call must be idempotent
      const second = await seedDatabaseIfEmpty(conn.db, 'superadmin');
      assert.equal(second, 'skipped');

      const allUsers = await conn.db.select().from(schema.users);
      assert.equal(allUsers.length, 1);
      assert.equal(allUsers[0].email, 'superadmin@finx.vn');
      assert.equal(allUsers[0].role, 'ADMIN');

      const [{ value: projCount }] = await conn.db.select({ value: count() }).from(schema.projects);
      const [{ value: suiteCount }] = await conn.db.select({ value: count() }).from(schema.suites);
      const [{ value: caseCount }] = await conn.db.select({ value: count() }).from(schema.testCases);
      const [{ value: runCount }] = await conn.db.select({ value: count() }).from(schema.testRuns);

      assert.equal(projCount, 0);
      assert.equal(suiteCount, 0);
      assert.equal(caseCount, 0);
      assert.equal(runCount, 0);
    } finally {
      await conn.close();
    }
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('MailService stays disabled and performs no-op when SMTP env vars are unset', async () => {
  const prevEnv = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
  };

  try {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    assert.equal(isSmtpConfigured(), false);
    assert.equal(isSmtpConfigured({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'a@b.com' }), false);
    assert.equal(
      isSmtpConfigured({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'a@b.com', SMTP_PASS: 'secret' }),
      true,
    );

    const mail = new MailService();
    assert.equal(mail.isEnabled(), false);
    const res1 = await mail.sendTempPasswordToUser({
      to: 'qa@finx.vn',
      fullName: 'QA User',
      tempPassword: 'Temp123!',
      mustChangePassword: true,
    });
    assert.deepEqual(res1, { sent: false, skipped: true });

    const res2 = await mail.sendPasswordResetRequestToAdmins({
      adminEmails: ['admin@finx.vn'],
      requesterEmail: 'qa@finx.vn',
      requesterName: 'QA User',
      note: 'Quên mật khẩu',
    });
    assert.deepEqual(res2, { sent: false, skipped: true });

    assert.equal(escapeHtml('<script>"a"&\'b\'</script>'), '&lt;script&gt;&quot;a&quot;&amp;&#39;b&#39;&lt;/script&gt;');
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('Google SSO helpers enforce allowed domains and never auto-provision ADMIN', () => {
  assert.equal(isGoogleAuthEnabled({}), false);
  assert.equal(isGoogleAuthEnabled({ GOOGLE_CLIENT_ID: '   ' }), false);
  assert.equal(isGoogleAuthEnabled({ GOOGLE_CLIENT_ID: 'abc.apps.googleusercontent.com' }), true);

  // Empty allowlist allows any valid email
  assert.equal(isGoogleEmailAllowed('user@finx.vn', ''), true);
  assert.equal(isGoogleEmailAllowed('user@gmail.com', undefined), true);

  // Domain restriction enforces exact domain match (case-insensitive, supports leading @)
  assert.equal(isGoogleEmailAllowed('QA@FinX.vn', 'finx.vn, @partner.com'), true);
  assert.equal(isGoogleEmailAllowed('pm@partner.com', 'finx.vn, @partner.com'), true);
  assert.equal(isGoogleEmailAllowed('evil@evilfinx.vn', 'finx.vn'), false);
  assert.equal(isGoogleEmailAllowed('personal@gmail.com', 'finx.vn'), false);
  assert.equal(isGoogleEmailAllowed('not-an-email', 'finx.vn'), false);

  // Default role strictly capped to QA, PM, or PO
  assert.equal(resolveGoogleDefaultRole('PM'), 'PM');
  assert.equal(resolveGoogleDefaultRole('pm'), 'PM');
  assert.equal(resolveGoogleDefaultRole('PO'), 'PO');
  assert.equal(resolveGoogleDefaultRole('po'), 'PO');
  assert.equal(resolveGoogleDefaultRole('QA'), 'QA');
  assert.equal(resolveGoogleDefaultRole('ADMIN'), 'QA');
  assert.equal(resolveGoogleDefaultRole('QA_LEAD'), 'QA');
  assert.equal(resolveGoogleDefaultRole(undefined), 'QA');
});

test('RBAC role helpers enforce QA_MANAGER, QA_LEAD, PM and PO permissions accurately', () => {
  // All-projects visibility: ADMIN & QA_MANAGER
  assert.equal(canViewAllProjects('ADMIN'), true);
  assert.equal(canViewAllProjects('QA_MANAGER'), true);
  assert.equal(canViewAllProjects('QA_LEAD'), false);
  assert.equal(canViewAllProjects('QA'), false);
  assert.equal(canViewAllProjects('PM'), false);
  assert.equal(canViewAllProjects('PO'), false);

  // Manage all users: ADMIN & QA_MANAGER
  assert.equal(canManageAllUsers('ADMIN'), true);
  assert.equal(canManageAllUsers('QA_MANAGER'), true);
  assert.equal(canManageAllUsers('QA_LEAD'), false);
  assert.equal(canManageAllUsers('QA'), false);
  assert.equal(canManageAllUsers('PO'), false);

  // Create users: ADMIN, QA_MANAGER, QA_LEAD
  assert.equal(canCreateUsers('ADMIN'), true);
  assert.equal(canCreateUsers('QA_MANAGER'), true);
  assert.equal(canCreateUsers('QA_LEAD'), true);
  assert.equal(canCreateUsers('QA'), false);
  assert.equal(canCreateUsers('PM'), false);
  assert.equal(canCreateUsers('PO'), false);

  // Creatable role ceilings prevent privilege escalation
  assert.deepEqual(creatableRolesFor('ADMIN'), ['ADMIN', 'QA_MANAGER', 'QA_LEAD', 'QA', 'PM', 'PO']);
  assert.deepEqual(creatableRolesFor('QA_MANAGER'), ['QA_MANAGER', 'QA_LEAD', 'QA', 'PM', 'PO']);
  assert.deepEqual(creatableRolesFor('QA_LEAD'), ['QA_LEAD', 'QA', 'PM', 'PO']);
  assert.deepEqual(creatableRolesFor('QA'), []);
  assert.deepEqual(creatableRolesFor('PO'), []);

  // Project management & case editing
  assert.equal(canManageProject('QA_MANAGER'), true);
  assert.equal(canEditCases('QA_MANAGER'), true);
  assert.equal(canManageProject('PM'), false);
  assert.equal(canEditCases('PM'), false);
  assert.equal(canManageProject('PO'), false);
  assert.equal(canEditCases('PO'), false);

  // Password reset permissions: QA_LEAD can only reset QA Engineer passwords
  assert.equal(canResetPasswordFor('ADMIN', 'ADMIN'), true);
  assert.equal(canResetPasswordFor('QA_MANAGER', 'ADMIN'), false);
  assert.equal(canResetPasswordFor('QA_MANAGER', 'QA_LEAD'), true);
  assert.equal(canResetPasswordFor('QA_MANAGER', 'QA'), true);
  assert.equal(canResetPasswordFor('QA_MANAGER', 'PO'), true);
  assert.equal(canResetPasswordFor('QA_LEAD', 'QA'), true);
  assert.equal(canResetPasswordFor('QA_LEAD', 'PM'), false);
  assert.equal(canResetPasswordFor('QA_LEAD', 'PO'), false);
  assert.equal(canResetPasswordFor('QA_LEAD', 'QA_LEAD'), false);
  assert.equal(canResetPasswordFor('QA_LEAD', 'QA_MANAGER'), false);
  assert.equal(canResetPasswordFor('QA_LEAD', 'ADMIN'), false);
});
