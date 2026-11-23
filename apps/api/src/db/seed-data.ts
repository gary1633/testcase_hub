import * as bcrypt from 'bcryptjs';
import { count, eq } from 'drizzle-orm';
import type { AppDb } from './client';
import {
  users,
  teams,
  teamMembers,
  projects,
  projectMembers,
  projectIntegrations,
  suites,
  testCases,
  testSteps,
} from './schema';

export type SeedMode = 'demo' | 'superadmin' | 'none';

export function resolveSeedMode(): SeedMode {
  const raw = process.env.SEED_MODE?.trim().toLowerCase();
  if (raw === 'demo' || raw === 'superadmin' || raw === 'none') {
    return raw;
  }
  return process.env.NODE_ENV === 'production' ? 'superadmin' : 'demo';
}

export async function seedDemoTeamsIfEmpty(db: AppDb): Promise<void> {
  const [{ value: teamCount }] = await db.select({ value: count() }).from(teams);
  if (teamCount > 0) return;

  const allUsers = await db.select().from(users);
  const byEmail = new Map(allUsers.map((u) => [u.email, u]));

  const [payTeam, appTeam] = await db
    .insert(teams)
    .values([
      {
        name: 'Payments & Checkout',
        description: 'Workstream Cổng thanh toán, Ví điện tử & Đối soát giao dịch',
        color: 'emerald',
      },
      {
        name: 'SuperApp & Onboarding',
        description: 'Workstream Mobile App, Đăng ký eKYC & Quản lý tài khoản',
        color: 'ocean',
      },
    ])
    .returning();

  const lead = byEmail.get('lead@company.local');
  const qa = byEmail.get('qa@company.local');
  const pm = byEmail.get('pm@company.local');
  const mgr = byEmail.get('manager@company.local');

  const memberValues: Array<{ teamId: string; userId: string }> = [];
  if (lead) {
    memberValues.push({ teamId: payTeam.id, userId: lead.id });
    memberValues.push({ teamId: appTeam.id, userId: lead.id });
  }
  if (qa) {
    memberValues.push({ teamId: payTeam.id, userId: qa.id });
  }
  if (pm) {
    memberValues.push({ teamId: appTeam.id, userId: pm.id });
  }
  if (mgr) {
    memberValues.push({ teamId: appTeam.id, userId: mgr.id });
  }

  if (memberValues.length > 0) {
    await db.insert(teamMembers).values(memberValues).onConflictDoNothing();
  }
}

export async function seedDatabaseIfEmpty(
  db: AppDb,
  explicitMode?: SeedMode,
): Promise<'demo' | 'superadmin' | 'skipped'> {
  const mode = explicitMode ?? resolveSeedMode();
  if (mode === 'none') {
    return 'skipped';
  }

  const [{ value: userCount }] = await db.select({ value: count() }).from(users);
  if (userCount > 0) {
    if (mode === 'demo') {
      const [existingMgr] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, 'manager@company.local'))
        .limit(1);
      if (!existingMgr) {
        const hashManager = await bcrypt.hash('Manager123!', 10);
        await db.insert(users).values({
          email: 'manager@company.local',
          passwordHash: hashManager,
          fullName: 'Vo Hoang Nam (QA Manager)',
          role: 'QA_MANAGER',
        });
      }
      await seedDemoTeamsIfEmpty(db);
    }
    return 'skipped';
  }

  if (mode === 'superadmin') {
    const email = (process.env.SUPERADMIN_EMAIL || 'admin@finx.local').trim().toLowerCase();
    const rawPassword = process.env.SUPERADMIN_PASSWORD?.trim() || 'FinxAdmin@2026!';
    const fullName = (process.env.SUPERADMIN_NAME || 'Super Admin').trim();
    const mustChange = process.env.SUPERADMIN_MUST_CHANGE_PASSWORD
      ? process.env.SUPERADMIN_MUST_CHANGE_PASSWORD === 'true'
      : !process.env.SUPERADMIN_PASSWORD?.trim();

    const passwordHash = await bcrypt.hash(rawPassword, 10);
    await db.insert(users).values({
      email,
      passwordHash,
      fullName,
      role: 'ADMIN',
      isActive: true,
      mustChangePassword: mustChange,
    });
    return 'superadmin';
  }

  const hashAdmin = await bcrypt.hash('Admin123!', 10);
  const hashManager = await bcrypt.hash('Manager123!', 10);
  const hashLead = await bcrypt.hash('Lead123!', 10);
  const hashQa = await bcrypt.hash('Qa123!', 10);
  const hashPm = await bcrypt.hash('Pm123!', 10);

  const [adminUser, _managerUser, leadUser, qaUser, pmUser] = await db
    .insert(users)
    .values([
      {
        email: 'admin@company.local',
        passwordHash: hashAdmin,
        fullName: 'Nguyen Minh Admin',
        role: 'ADMIN',
      },
      {
        email: 'manager@company.local',
        passwordHash: hashManager,
        fullName: 'Vo Hoang Nam (QA Manager)',
        role: 'QA_MANAGER',
      },
      {
        email: 'lead@company.local',
        passwordHash: hashLead,
        fullName: 'Tran Thu Ha (QA Lead)',
        role: 'QA_LEAD',
      },
      {
        email: 'qa@company.local',
        passwordHash: hashQa,
        fullName: 'Le Quoc Anh (QA)',
        role: 'QA',
      },
      {
        email: 'pm@company.local',
        passwordHash: hashPm,
        fullName: 'Pham Gia Bao (PM)',
        role: 'PM',
      },
    ])
    .returning();

  const [webProject, mobProject] = await db
    .insert(projects)
    .values([
      {
        code: 'WEB',
        name: 'E-Commerce Web Portal',
        description:
          'Cổng thương mại điện tử chính dành cho khách hàng (Web Desktop & Mobile Web).',
        caseCounter: 0,
      },
      {
        code: 'MOB',
        name: 'Customer Mobile App (iOS / Android)',
        description: 'Ứng dụng di động mua sắm, tích điểm và thông báo đơn hàng.',
        caseCounter: 0,
      },
    ])
    .returning();

  // Assign members to both projects
  await db.insert(projectMembers).values([
    { projectId: webProject.id, userId: adminUser.id, role: 'QA_LEAD' },
    { projectId: webProject.id, userId: leadUser.id, role: 'QA_LEAD' },
    { projectId: webProject.id, userId: qaUser.id, role: 'QA' },
    { projectId: webProject.id, userId: pmUser.id, role: 'PM' },
    { projectId: mobProject.id, userId: adminUser.id, role: 'QA_LEAD' },
    { projectId: mobProject.id, userId: leadUser.id, role: 'QA_LEAD' },
    { projectId: mobProject.id, userId: qaUser.id, role: 'QA' },
    { projectId: mobProject.id, userId: pmUser.id, role: 'PM' },
  ]);

  await seedDemoTeamsIfEmpty(db);

  // Pre-seed disabled Jira integration placeholder for WEB project
  await db.insert(projectIntegrations).values({
    projectId: webProject.id,
    provider: 'jira',
    isEnabled: false,
    config: {
      baseUrl: 'https://your-company.atlassian.net',
      email: 'qa-bot@company.local',
      apiToken: '',
      projectKey: 'ECOM',
      defaultIssueType: 'Bug',
    },
  });

  // Create nested suites for WEB project
  const [authSuite, catalogSuite, checkoutSuite, orderSuite] = await db
    .insert(suites)
    .values([
      {
        projectId: webProject.id,
        title: 'Authentication & Account',
        description: 'Đăng nhập, đăng ký, quên mật khẩu và bảo mật phiên làm việc.',
        position: 0,
      },
      {
        projectId: webProject.id,
        title: 'Product Catalog & Search',
        description: 'Tìm kiếm, bộ lọc sản phẩm, chi tiết sản phẩm.',
        position: 1,
      },
      {
        projectId: webProject.id,
        title: 'Cart & Checkout',
        description: 'Giỏ hàng, mã giảm giá và cổng thanh toán.',
        position: 2,
      },
      {
        projectId: webProject.id,
        title: 'Order Management',
        description: 'Theo dõi trạng thái đơn hàng, hủy đơn và hoàn tiền.',
        position: 3,
      },
    ])
    .returning();

  const [loginSubSuite, registerSubSuite, paymentSubSuite, voucherSubSuite] = await db
    .insert(suites)
    .values([
      {
        projectId: webProject.id,
        parentId: authSuite.id,
        title: 'Login & Session',
        position: 0,
      },
      {
        projectId: webProject.id,
        parentId: authSuite.id,
        title: 'Registration & OTP',
        position: 1,
      },
      {
        projectId: webProject.id,
        parentId: checkoutSuite.id,
        title: 'Payment Gateways',
        position: 0,
      },
      {
        projectId: webProject.id,
        parentId: checkoutSuite.id,
        title: 'Vouchers & Discounts',
        position: 1,
      },
    ])
    .returning();

  const webCasesSeed = [
    {
      suiteId: loginSubSuite.id,
      title: 'Đăng nhập thành công với Email và mật khẩu hợp lệ',
      description: 'Xác minh người dùng có thể đăng nhập bằng tài khoản đã kích hoạt.',
      preconditions: 'Tài khoản customer01@example.com đã tồn tại và ở trạng thái Active.',
      priority: 'CRITICAL',
      severity: 'BLOCKER',
      type: 'SMOKE',
      automationStatus: 'AUTOMATED',
      status: 'ACTIVE',
      tags: ['auth', 'smoke', 'release-v2'],
      jiraIssueKeys: ['ECOM-101'],
      steps: [
        {
          action: 'Mở trang đăng nhập /login',
          data: 'URL: https://shop.company.local/login',
          expectedResult: 'Hiển thị form nhập Email, Password và nút Đăng nhập.',
        },
        {
          action: 'Nhập email và mật khẩu hợp lệ, sau đó nhấn Đăng nhập',
          data: 'Email: customer01@example.com / Pass: ValidPass@123',
          expectedResult:
            'Chuyển hướng về trang chủ, hiển thị tên người dùng ở thanh điều hướng và lưu session cookie.',
        },
      ],
    },
    {
      suiteId: loginSubSuite.id,
      title: 'Khóa tài khoản tạm thời sau 5 lần nhập sai mật khẩu liên tiếp',
      description: 'Đảm bảo cơ chế chống brute-force hoạt động đúng theo chính sách bảo mật.',
      preconditions: 'Tài khoản hợp lệ chưa bị khóa.',
      priority: 'HIGH',
      severity: 'CRITICAL',
      type: 'SECURITY',
      automationStatus: 'AUTOMATED',
      status: 'ACTIVE',
      tags: ['auth', 'security'],
      jiraIssueKeys: ['ECOM-104'],
      steps: [
        {
          action: 'Nhập đúng email nhưng sai mật khẩu 5 lần liên tiếp',
          data: 'Password: WrongPassword!',
          expectedResult: 'Mỗi lần hiển thị thông báo sai thông tin đăng nhập.',
        },
        {
          action: 'Thử đăng nhập lần thứ 6 bằng mật khẩu đúng',
          data: 'Password: ValidPass@123',
          expectedResult:
            'Hệ thống từ chối đăng nhập và hiển thị thông báo tài khoản bị khóa trong 15 phút.',
        },
      ],
    },
    {
      suiteId: loginSubSuite.id,
      title: 'Đăng nhập qua Google OAuth (SSO) cho tài khoản mới',
      description: 'Kiểm tra luồng liên kết tài khoản Google lần đầu.',
      preconditions: 'Email Google chưa từng đăng ký trên hệ thống.',
      priority: 'HIGH',
      severity: 'MAJOR',
      type: 'INTEGRATION',
      automationStatus: 'MANUAL',
      status: 'ACTIVE',
      tags: ['auth', 'oauth'],
      jiraIssueKeys: ['ECOM-112'],
      steps: [
        {
          action: 'Nhấn nút "Tiếp tục với Google" trên trang đăng nhập',
          data: 'Tài khoản Google test',
          expectedResult: 'Mở popup chọn tài khoản Google và yêu cầu cấp quyền email/profile.',
        },
        {
          action: 'Xác nhận cấp quyền',
          data: '',
          expectedResult: 'Tự động tạo hồ sơ người dùng mới và điều hướng về trang chủ.',
        },
      ],
    },
    {
      suiteId: registerSubSuite.id,
      title: 'Gửi lại mã OTP xác thực email sau 60 giây chờ',
      description: 'Kiểm tra bộ đếm cooldown và vô hiệu hóa mã OTP cũ khi cấp mã mới.',
      preconditions: 'Người dùng đang ở màn hình nhập OTP đăng ký.',
      priority: 'MEDIUM',
      severity: 'NORMAL',
      type: 'FUNCTIONAL',
      automationStatus: 'TO_BE_AUTOMATED',
      status: 'ACTIVE',
      tags: ['auth', 'otp'],
      jiraIssueKeys: ['ECOM-118'],
      steps: [
        {
          action: 'Quan sát nút "Gửi lại OTP" ngay khi vào màn hình',
          data: '',
          expectedResult: 'Nút bị disable và đếm ngược từ 60s về 0s.',
        },
        {
          action: 'Chờ hết 60s và nhấn "Gửi lại OTP"',
          data: '',
          expectedResult: 'Email mới được gửi; mã OTP cũ không còn hiệu lực nếu nhập lại.',
        },
      ],
    },
    {
      suiteId: catalogSuite.id,
      title: 'Tìm kiếm sản phẩm theo từ khóa tiếng Việt có dấu và không dấu',
      description: 'Đảm bảo công cụ tìm kiếm chuẩn hóa dấu tiếng Việt chính xác.',
      preconditions: 'Có sẵn sản phẩm "Tai nghe chống ồn không dây".',
      priority: 'HIGH',
      severity: 'MAJOR',
      type: 'FUNCTIONAL',
      automationStatus: 'AUTOMATED',
      status: 'ACTIVE',
      tags: ['search', 'catalog'],
      jiraIssueKeys: ['ECOM-205'],
      steps: [
        {
          action: 'Nhập từ khóa không dấu "tai nghe chong on" vào ô tìm kiếm',
          data: 'Query: tai nghe chong on',
          expectedResult: 'Danh sách kết quả trả về chứa sản phẩm "Tai nghe chống ồn không dây".',
        },
        {
          action: 'Lọc thêm theo khoảng giá 1.000.000 - 3.000.000đ',
          data: 'minPrice=1000000, maxPrice=3000000',
          expectedResult: 'Chỉ hiển thị các sản phẩm nằm đúng khoảng giá và giữ nguyên từ khóa.',
        },
      ],
    },
    {
      suiteId: catalogSuite.id,
      title: 'Phân trang & Lazy loading danh sách 500+ sản phẩm trong danh mục',
      description: 'Kiểm tra thời gian phản hồi và không bị trùng lặp sản phẩm khi chuyển trang.',
      preconditions: 'Danh mục Điện tử có tối thiểu 500 sản phẩm active.',
      priority: 'MEDIUM',
      severity: 'NORMAL',
      type: 'PERFORMANCE',
      automationStatus: 'TO_BE_AUTOMATED',
      status: 'ACTIVE',
      tags: ['catalog', 'performance'],
      jiraIssueKeys: ['ECOM-214'],
      steps: [
        {
          action: 'Mở danh mục Điện tử và đo thời gian tải trang đầu tiên',
          data: 'Page size = 40',
          expectedResult: 'API phản hồi dưới 400ms, hiển thị đúng 40 sản phẩm.',
        },
        {
          action: 'Chuyển lần lượt sang trang 2 và trang 3',
          data: 'sort=price_asc',
          expectedResult: 'Thứ tự giá tăng dần liên tục, không trùng SKU giữa các trang.',
        },
      ],
    },
    {
      suiteId: paymentSubSuite.id,
      title: 'Thanh toán thành công qua cổng VNPay QR',
      description: 'Xác nhận callback IPN cập nhật trạng thái đơn hàng sang Đã thanh toán.',
      preconditions: 'Giỏ hàng có ít nhất 1 sản phẩm còn tồn kho; môi trường VNPay Sandbox hoạt động.',
      priority: 'CRITICAL',
      severity: 'BLOCKER',
      type: 'SMOKE',
      automationStatus: 'MANUAL',
      status: 'ACTIVE',
      tags: ['checkout', 'payment', 'smoke'],
      jiraIssueKeys: ['ECOM-301', 'ECOM-309'],
      steps: [
        {
          action: 'Tại trang Checkout, chọn phương thức "VNPay QR" và nhấn Đặt hàng',
          data: 'Tổng tiền: 1.250.000đ',
          expectedResult: 'Tạo đơn hàng trạng thái Pending Payment và điều hướng sang cổng VNPay.',
        },
        {
          action: 'Hoàn tất thanh toán trên trang Sandbox',
          data: 'Mã OTP test: 123456',
          expectedResult:
            'Điều hướng về trang Cảm ơn, trạng thái đơn chuyển sang Paid và trừ tồn kho chính xác.',
        },
      ],
    },
    {
      suiteId: paymentSubSuite.id,
      title: 'Xử lý hoàn tồn kho khi người dùng hủy thanh toán ở cổng ngân hàng',
      description: 'Đảm bảo sản phẩm giữ chỗ được nhả lại khi giao dịch thất bại hoặc timeout.',
      preconditions: 'Sản phẩm A còn tồn kho đúng 1 đơn vị.',
      priority: 'CRITICAL',
      severity: 'CRITICAL',
      type: 'REGRESSION',
      automationStatus: 'AUTOMATED',
      status: 'ACTIVE',
      tags: ['checkout', 'inventory', 'regression'],
      jiraIssueKeys: ['ECOM-315'],
      steps: [
        {
          action: 'Tạo đơn hàng mua 1 sản phẩm A và đi đến cổng thanh toán',
          data: 'SKU: PROD-A-01',
          expectedResult: 'Tồn kho khả dụng giảm tạm thời về 0.',
        },
        {
          action: 'Nhấn Hủy giao dịch trên cổng thanh toán',
          data: '',
          expectedResult:
            'Đơn hàng chuyển sang Payment Failed và tồn kho khả dụng của sản phẩm A hồi về 1.',
        },
      ],
    },
    {
      suiteId: voucherSubSuite.id,
      title: 'Từ chối áp dụng mã giảm giá đã hết hạn sử dụng',
      description: 'Kiểm tra thông báo lỗi rõ ràng và không thay đổi tổng tiền đơn hàng.',
      preconditions: 'Voucher EXPIRED20 đã quá ngày hiệu lực.',
      priority: 'MEDIUM',
      severity: 'MINOR',
      type: 'FUNCTIONAL',
      automationStatus: 'AUTOMATED',
      status: 'ACTIVE',
      tags: ['voucher', 'checkout'],
      jiraIssueKeys: ['ECOM-340'],
      steps: [
        {
          action: 'Nhập mã EXPIRED20 vào ô Mã khuyến mãi tại trang giỏ hàng',
          data: 'Code: EXPIRED20',
          expectedResult: 'Hiển thị lỗi "Mã giảm giá đã hết hạn", tổng tiền giữ nguyên.',
        },
      ],
    },
    {
      suiteId: orderSuite.id,
      title: 'Khách hàng hủy đơn hàng ở trạng thái Chờ xác nhận',
      description: 'Xác minh khách hàng tự hủy được đơn trước khi kho đóng gói.',
      preconditions: 'Có đơn hàng mới tạo ở trạng thái Pending Confirmation.',
      priority: 'HIGH',
      severity: 'MAJOR',
      type: 'FUNCTIONAL',
      automationStatus: 'MANUAL',
      status: 'ACTIVE',
      tags: ['orders', 'regression'],
      jiraIssueKeys: ['ECOM-402'],
      steps: [
        {
          action: 'Vào Lịch sử đơn hàng -> Chi tiết đơn -> Nhấn "Hủy đơn hàng"',
          data: 'Lý do: Thay đổi địa chỉ nhận hàng',
          expectedResult: 'Đơn chuyển sang Cancelled, gửi email xác nhận hủy đơn.',
        },
      ],
    },
  ];

  let webSeq = 0;
  for (let i = 0; i < webCasesSeed.length; i++) {
    webSeq += 1;
    const item = webCasesSeed[i];
    const [created] = await db
      .insert(testCases)
      .values({
        projectId: webProject.id,
        suiteId: item.suiteId,
        seqNumber: webSeq,
        title: item.title,
        description: item.description,
        preconditions: item.preconditions,
        priority: item.priority,
        severity: item.severity,
        type: item.type,
        automationStatus: item.automationStatus,
        status: item.status,
        tags: item.tags,
        jiraIssueKeys: item.jiraIssueKeys,
        position: i,
        createdBy: qaUser.id,
        updatedBy: leadUser.id,
      })
      .returning();

    if (item.steps.length > 0) {
      await db.insert(testSteps).values(
        item.steps.map((s, idx) => ({
          testCaseId: created.id,
          stepOrder: idx,
          action: s.action,
          data: s.data,
          expectedResult: s.expectedResult,
        })),
      );
    }
  }

  await db
    .update(projects)
    .set({ caseCounter: webSeq })
    .where(eq(projects.id, webProject.id));

  // Seed Mobile project suites & cases
  const [mobAuthSuite, mobPushSuite] = await db
    .insert(suites)
    .values([
      {
        projectId: mobProject.id,
        title: 'Biometric Login (FaceID / TouchID)',
        position: 0,
      },
      {
        projectId: mobProject.id,
        title: 'Push Notifications',
        position: 1,
      },
    ])
    .returning();

  const mobCases = [
    {
      suiteId: mobAuthSuite.id,
      title: 'Đăng nhập nhanh bằng FaceID trên iOS sau khi đã bật trong Cài đặt',
      priority: 'HIGH',
      severity: 'MAJOR',
      type: 'FUNCTIONAL',
      automationStatus: 'MANUAL',
      tags: ['ios', 'biometric'],
      jiraIssueKeys: ['MOB-12'],
    },
    {
      suiteId: mobPushSuite.id,
      title: 'Mở đúng màn hình chi tiết đơn hàng khi chạm vào Push Notification',
      priority: 'HIGH',
      severity: 'MAJOR',
      type: 'INTEGRATION',
      automationStatus: 'TO_BE_AUTOMATED',
      tags: ['deeplink', 'push'],
      jiraIssueKeys: ['MOB-28'],
    },
  ];

  let mobSeq = 0;
  for (let i = 0; i < mobCases.length; i++) {
    mobSeq += 1;
    const c = mobCases[i];
    const [created] = await db
      .insert(testCases)
      .values({
        projectId: mobProject.id,
        suiteId: c.suiteId,
        seqNumber: mobSeq,
        title: c.title,
        description: '',
        preconditions: 'Thiết bị cài đặt bản build mới nhất.',
        priority: c.priority,
        severity: c.severity,
        type: c.type,
        automationStatus: c.automationStatus,
        status: 'ACTIVE',
        tags: c.tags,
        jiraIssueKeys: c.jiraIssueKeys,
        position: i,
        createdBy: leadUser.id,
        updatedBy: leadUser.id,
      })
      .returning();

    await db.insert(testSteps).values({
      testCaseId: created.id,
      stepOrder: 0,
      action: 'Thực hiện thao tác trên thiết bị thật',
      data: 'iOS 18 / Android 15',
      expectedResult: 'Ứng dụng phản hồi mượt mà, đúng luồng nghiệp vụ.',
    });
  }

  await db
    .update(projects)
    .set({ caseCounter: mobSeq })
    .where(eq(projects.id, mobProject.id));

  return 'demo';
}
