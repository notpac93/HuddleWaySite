export type Link = {
  label: string;
  href: string;
};

export type CallToAction = {
  label: string;
  href: string;
  prompt?: 'app-store-choice';
};

export type AppStorePrompt = {
  title: string;
  body: string;
  admin: {
    label: string;
    href: string;
    note: string;
  };
  family: {
    label: string;
    href?: string;
    note: string;
  };
  dismissLabel: string;
};

export type Card = {
  title: string;
  body: string;
  eyebrow?: string;
  summary?: string;
  tone?: 'brand' | 'field' | 'accent';
};

export type Step = {
  title: string;
  body: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type WorkflowCard = {
  title: string;
  body: string;
  benefit: string;
  bullets: string[];
  eyebrow?: string;
  tag?: string;
  tone?: 'brand' | 'field' | 'accent';
};

export type ResultCard = {
  value: string;
  title: string;
  body: string;
  tone?: 'brand' | 'field' | 'accent';
};

export type PreviewMockup = {
  label: string;
  title?: string;
  items?: string[];
  action?: string;
  theme?: 'light' | 'dark';
  tone?: 'brand' | 'field' | 'accent';
  tilt?: 'left' | 'right' | 'none';
  asset?: {
    src: string;
    alt: string;
    frame?: 'none' | 'screen';
    fit?: 'contain' | 'cover';
  };
};

export type DeploymentAnimation = {
  title: string;
  body: string;
  src: string;
  label: string;
  poster?: string;
};

export type FeatureSection = {
  id: string;
  title: string;
  body: string;
  benefit: string;
  operatorTitle: string;
  operatorItems: string[];
  familyTitle: string;
  familyItems: string[];
  mockup: PreviewMockup;
};

export type CompareItem = {
  title: string;
  body: string;
};

export type SavingsCard = {
  title: string;
  before: string;
  after: string;
  tag: string;
  tone?: 'brand' | 'field' | 'accent';
  icon?: 'announce' | 'payment' | 'roster' | 'schedule' | 'family' | 'registration';
};

export type ToolItem = {
  title: string;
  body: string;
};

const withBase = (path: string) => {
  if (path.startsWith('#')) {
    return path;
  }

  const [pathname, hash = ''] = path.split('#');
  const normalizedPath = pathname.replace(/^\/+|\/+$/g, '');
  const resolved = normalizedPath === '' ? '/' : `/${normalizedPath}/`;

  return hash ? `${resolved}#${hash}` : resolved;
};

const mockupAsset = (fileName: string, alt: string, fit: 'contain' | 'cover' = 'contain'): NonNullable<PreviewMockup['asset']> => ({
  src: `/mockups/${fileName.split('/').map(encodeURIComponent).join('/')}`,
  alt,
  frame: 'none',
  fit,
});

export const siteMeta = {
  name: 'HuddleWay',
  title: 'HuddleWay | Branded App for Youth Sports',
  description:
    'HuddleWay gives youth sports programs a branded experience for supported registration, connected-account payments, schedules, and updates.',
  footerBlurb:
    'Built for youth sports programs that want branded, connected registration, payment, schedule, and update workflows.',

};

export const navigation: Link[] = [
  { label: 'Home', href: withBase('/') },
  { label: 'Features', href: withBase('/features') },
  { label: 'Savings', href: withBase('/savings') },
  { label: 'Setup FAQ', href: withBase('/setup-faq') },
];

export const trustLinks: Link[] = [
  { label: 'Support', href: withBase('/support') },
  { label: 'Privacy', href: withBase('/privacy') },
  { label: 'Terms', href: withBase('/terms') },
];

export const primaryCta: CallToAction = {
  label: 'Download App',
  href: 'https://apps.apple.com/us/app/huddleway-admin/id6761773042',
  prompt: 'app-store-choice',
};

export const appStorePrompt: AppStorePrompt = {
  title: 'Choose your app',
  body: 'Are you Administrator or Family?',
  admin: {
    label: 'Administrator',
    href: 'https://apps.apple.com/us/app/huddleway-admin/id6761773042',
    note: 'Open the HuddleWay Admin app in the App Store.',
  },
  family: {
    label: 'Family',
    note: 'Family App Store link coming soon.',
  },
  dismissLabel: 'Not now',
};

export const secondaryCta: CallToAction = {
  label: 'See Family App Features',
  href: withBase('/features'),
};

export const featuresSecondaryCta: CallToAction = {
  label: 'See Program Savings',
  href: withBase('/savings'),
};

export const savingsSecondaryCta: CallToAction = {
  label: 'See Setup FAQ',
  href: withBase('/setup-faq'),
};

export const homePage = {
  pageName: 'home',
  title: siteMeta.title,
  description:
    'Branded program experience for supported registration, connected-account payments, schedules, and updates.',
  hero: {
    eyebrow: 'For Youth Sports Programs',
    title: 'A branded app for youth sports programs.',
    body: 'Bring supported registration, connected-account payments, schedules, and updates into a branded program experience.',
  },
  heroPill: 'Built around your program and its configured workflows.',
  quickChecks: [
    'Youth sports',
    'Free admin setup',
    'Connected payments',
    'Your brand',
  ],
  heroVisuals: [
    {
      label: 'Family view',
      theme: 'light',
      tone: 'brand',
      tilt: 'left',
      asset: mockupAsset('consumer/1.png', 'Program selection screen on an angled phone render.'),
    },
    {
      label: 'Program app',
      theme: 'dark',
      tone: 'accent',
      tilt: 'right',
      asset: mockupAsset('consumer/2.png', 'Branded HuddleWay landing screen with registration open.'),
    },
  ] satisfies PreviewMockup[],
  adminAnimations: {
    eyebrow: 'HuddleWay Admin',
    title: 'Explore the HuddleWay Admin experience.',
    videos: [
      {
        title: 'HuddleWay Admin for iOS',
        body: 'See the administrator experience for configuring schedules, registration, payments, and updates. Availability depends on the program and released app version.',
        src: '/mockups/admin/huddleway-admin-new-ios-app.mp4',
        label: 'HuddleWay Admin new iOS app deployment animation.',
      },
    ] satisfies DeploymentAnimation[],
  },
  results: {
    title: 'What your program gets',
    body: 'Free administration. Connected payment records. Your program’s brand.',
    cards: [
      {
        value: 'Built for',
        title: 'Clubs, camps, leagues, and training businesses',
        body: 'Use HuddleWay when your youth sports program needs one clear app for clients and families.',
        tone: 'brand',
      },
      {
        value: 'Payment model',
        title: 'Connected-account processing',
        body: 'Supported payment flows use the program’s connected Stripe account. Pricing, processor fees, payout timing, and availability depend on the program’s agreement and configuration.',
        tone: 'field',
      },
      {
        value: 'Your logo',
        title: 'Makes the app easier to trust',
        body: 'Swap in your brand so people recognize your program.',
        tone: 'accent',
      },
    ] satisfies ResultCard[],
  },
  steps: {
    title: 'What your team actually does',
    body: 'Set the brand, set the payment and registration flow, then share one app.',
    items: [
      {
        title: 'Add your brand and program basics',
        body: 'Upload your logo, colors, dates, fees, and locations.',
      },
      {
        title: 'Set registration, payments, and updates',
        body: 'Decide what families need to pay, read, and do next.',
      },
      {
        title: 'Invite families and clients',
        body: 'Once the program and app release are approved, share the supported registration, payment, schedule, and update paths.',
      },
    ] satisfies Step[],
  },
  stepsVisual: {
    label: 'Registration preview',
    theme: 'dark',
    tone: 'accent',
    tilt: 'none',
    asset: mockupAsset('consumer/3.png', 'Hand-held registration form screen inside the HuddleWay app.'),
  } satisfies PreviewMockup,
  showcase: {
    title: 'One app people can recognize and come back to',
    body: 'Keep your program name, pricing, schedules, registration, and updates together so clients and families know where to look next.',
    bullets: [
      {
        title: 'Brand the app to your program',
        body: 'Use your logo and colors so the experience looks familiar from the first tap.',
      },
      {
        title: 'Keep registration and payment close',
        body: 'Put the next step where families already see the program details.',
      },
      {
        title: 'Reach people in a cleaner place',
        body: 'Post updates alongside configured schedules and offers in the family app.',
      },
    ] satisfies Card[],
    note: 'Branded for your program and built for repeat use.',
    mockup: {
      label: 'Branded club app',
      theme: 'dark',
      tone: 'field',
      tilt: 'none',
      asset: mockupAsset('consumer/4.png', 'Family-facing HuddleWay home screen with featured program highlights.'),
    } satisfies PreviewMockup,
  },
  cta: {
    eyebrow: 'See The Fit',
    title: 'Put your youth sports program in one clean app',
    body: 'If your team wants branded registration, connected-account payments, and clearer family communication, start here.',
  },
};

export const featuresPage = {
  pageName: 'features',
  title: 'Features | Youth Sports Program App | HuddleWay',
  description:
    'See how HuddleWay connects supported branding, registration, connected-account payment, schedule, and update workflows.',
  hero: {
    eyebrow: 'How HuddleWay Works',
    title: 'What your youth sports program can run inside HuddleWay.',
    body:
      'Use one branded app to present your program, take registrations and payments, post schedules, and share updates with clients and families.',
  },
  overview: {
    title: 'What HuddleWay actually helps you do',
    body: 'Answer the first practical questions fast: who it is for, what families can do, and what your team controls.',
    cards: [
      {
        value: 'Built for',
        title: 'Youth sports programs',
        body: 'Clubs, camps, leagues, and training businesses that want one branded app.',
        tone: 'brand',
      },
      {
        value: 'Families can',
        title: 'Register, pay, and stay updated',
        body: 'Give people one branded starting point for schedules, eligible payment steps, updates, and next actions.',
        tone: 'field',
      },
      {
        value: 'Your team controls',
        title: 'Brand, content, and workflow',
        body: 'Update supported pages, events, fees, and announcements through the configured admin workflows.',
        tone: 'accent',
      },
    ] satisfies ResultCard[],
  },
  showcase: {
    eyebrow: 'Why Branding Matters',
    title: 'Your clients should recognize your program immediately.',
    body: 'HuddleWay changes the app branding to match your logo and colors so families know they are in the right place before they register or pay.',
    chips: ['Your logo', 'Your colors', 'Your next step'],
    badges: ['Recognizable', 'Built for families'],
    mockup: {
      label: 'Family app view',
      theme: 'dark',
      tone: 'brand',
      tilt: 'none',
      asset: mockupAsset('consumer/1.png', 'Branded HuddleWay family app home screen.'),
    } satisfies PreviewMockup,
  },
  indexLinks: [
    { label: 'Setup', href: '#publishing' },
    { label: 'Events', href: '#schedules' },
    { label: 'Payments', href: '#registration' },
    { label: 'Updates', href: '#communication' },
    { label: 'Brand', href: '#branding' },
  ] satisfies Link[],
  sections: [
    {
      id: 'publishing',
      title: 'Program pages and offer details',
      body: 'Show what your program is, what it costs, where it happens, and what people should do next.',
      benefit: 'Fewer basic questions before registration.',
      operatorTitle: 'Your team can',
      operatorItems: [
        'Update dates, fees, age groups, and locations in one place',
        'Publish the current configured offer from a supported admin flow',
      ],
      familyTitle: 'Families can',
      familyItems: [
        'See if the program fits',
        'Know the next step before reaching out',
      ],
      mockup: {
        label: 'Program overview',
        theme: 'light',
        tone: 'brand',
        tilt: 'none',
        asset: mockupAsset('consumer/2.png', 'Program details and registration showing dates and fees.'),
      },
    },
    {
      id: 'schedules',
      title: 'Events and schedules',
      body: 'Keep event times, locations, and changes in one place people can check fast.',
      benefit: 'One configured place to publish the current schedule.',
      operatorTitle: 'Your team can',
      operatorItems: [
        'Post event dates and schedule changes',
        'Update the latest timing once',
      ],
      familyTitle: 'Families can',
      familyItems: [
        'Check the latest timing',
        'Confirm locations and event details quickly',
      ],
      mockup: {
        label: 'Schedule view',
        theme: 'dark',
        tone: 'field',
        tilt: 'none',
        asset: mockupAsset('admin/2.png', 'Event management screen for updating schedules.'),
      },
    },
    {
      id: 'registration',
      title: 'Registration and connected-account payments',
      body: 'Let families register and pay your program in a cleaner branded flow.',
      benefit: 'A clearer supported path from registration to payment.',
      operatorTitle: 'Your team can',
      operatorItems: [
        'Set pricing and payment expectations clearly',
        'Collect eligible program payments through the configured connected-account flow',
      ],
      familyTitle: 'Families can',
      familyItems: [
        'See what to pay and what happens next',
        'Finish registration with less confusion',
      ],
      mockup: {
        label: 'Registration flow',
        theme: 'light',
        tone: 'accent',
        tilt: 'none',
        asset: mockupAsset('consumer/5.png', 'Payment and registration checkout screen.'),
      },
    },
    {
      id: 'communication',
      title: 'Updates people will actually see',
      body: 'Post supported reminders, changes, and next steps in the branded family app feed.',
      benefit: 'One branded place for supported announcements and changes.',
      operatorTitle: 'Your team can',
      operatorItems: [
        'Share reminders and changes in one branded place',
        'Keep the current announcement visible in the configured app feed',
      ],
      familyTitle: 'Families can',
      familyItems: [
        'Find updates faster',
        'Understand what changed without digging through old messages',
      ],
      mockup: {
        label: 'Updates feed',
        theme: 'dark',
        tone: 'brand',
        tilt: 'none',
        asset: mockupAsset('consumer/7.png', 'Program board showing latest updates and announcements.'),
      },
    },
    {
      id: 'branding',
      title: 'Your brand',
      body: 'Keep the app tied to your program identity so families and clients recognize the experience.',
      benefit: 'A recognizable program presence.',
      operatorTitle: 'Your team can',
      operatorItems: [
        'Apply your logo and colors',
        'Keep the experience visually connected from first tap to payment',
      ],
      familyTitle: 'Families can',
      familyItems: [
        'Recognize the program immediately',
        'Feel more confident they are in the right place',
      ],
      mockup: {
        label: 'Branded app',
        theme: 'light',
        tone: 'brand',
        tilt: 'none',
        asset: mockupAsset('admin/1.png', 'App menu prominently featuring the program logo and colors.'),
      },
    },
  ] satisfies FeatureSection[],
  proof: {
    title: 'Built for the workflows youth programs repeat',
    body:
      'HuddleWay is for programs that need branded presentation, connected payment workflows, and simpler day-to-day communication.',
  },
  cta: {
    eyebrow: 'Feature Tour',
    title: 'See how your program would run in HuddleWay',
    body:
      'Walk through the brand, payment, schedule, and update workflow before you download.',
  },
};

export const savingsPage = {
  pageName: 'savings',
  title: 'Savings | Fewer Tools for Sports Programs | HuddleWay',
  description:
    'See how HuddleWay can help youth sports programs connect supported registration, payment, schedule, and communication workflows in a branded experience.',
  hero: {
    eyebrow: 'Program Payments And Operations',
    title: 'Keep the payment path and family path cleaner.',
    body:
      'HuddleWay connects supported program workflows and uses a configured Stripe connected account for eligible payment paths.',
  },
  snapshot: {
    title: 'Payment terms should be clear before launch.',
    body: 'Creating and administering a program is free. Platform pricing, processor fees, payout timing, refunds, disputes, and supported payment methods apply only to configured payment flows and depend on the approved agreement and Stripe configuration.',
  },
  comparison: {
    title: 'What gets simpler when everything stays connected',
    body: 'Compare scattered tools with one branded app for registration, payments, schedules, and updates.',
    beforeLabel: 'Without HuddleWay',
    beforeItems: [
      {
        title: 'Families ask where to go',
        body: 'Details, schedule, and payment live in different places.',
      },
      {
        title: 'Payment confirmation is separate',
        body: 'Your team double-checks another system to see what is complete.',
      },
      {
        title: 'Brand disappears mid-flow',
        body: 'The next step looks disconnected from your program.',
      },
    ] satisfies CompareItem[],
    afterLabel: 'With HuddleWay',
    afterItems: [
      {
        title: 'One place to act',
        body: 'People can review details, register, and start eligible payment steps from one branded program flow.',
      },
      {
        title: 'Connected payment records',
        body: 'Eligible payment flows use the program’s configured Stripe connected account and remain subject to the approved pricing and payout terms.',
      },
      {
        title: 'Brand stays visible',
        body: 'Logo, colors, and program context stay attached to the next step.',
      },
    ] satisfies CompareItem[],
  },
  comparisonVisual: {
    label: 'Admin staff workflow',
    theme: 'dark',
    tone: 'field',
    tilt: 'none',
    asset: mockupAsset('admin/3.png', 'Angled admin staff management screen for team operations.'),
  } satisfies PreviewMockup,
  spotlight: {
    eyebrow: 'Why It Sticks',
    title: 'A familiar place for people to return to.',
    body: 'When clients and families can register, start eligible payment steps, and check updates in one recognizable app, your team can reduce repeated handoffs.',
    chips: ['Connected pay', 'Branded app', 'Clear updates'],
    badges: ['Your program', 'One path'],
    mockup: {
      label: 'Team view',
      theme: 'dark',
      tone: 'field',
      tilt: 'none',
      asset: mockupAsset('admin/4.png', 'Admin staff management screen for multi-team coordination.'),
    } satisfies PreviewMockup,
  },
  timeBack: {
    title: 'Where time comes back',
    body: 'Use HuddleWay to centralize supported admin workflows while keeping the payment flow explicit.',
    cards: [
      {
        title: 'Announcements',
        before: 'Same update, several channels.',
        after: 'Post once to the configured in-app announcements feed.',
        tag: 'Less repeat posting',
        tone: 'brand',
        icon: 'announce',
      },
      {
        title: 'Schedule changes',
        before: 'Timing changes get resent again.',
        after: 'Families check the latest schedule.',
        tag: 'Less resending',
        tone: 'field',
        icon: 'schedule',
      },
      {
        title: 'Payment questions',
        before: 'People ask what to pay and where to do it.',
        after: 'Pricing and next steps stay in the same flow.',
        tag: 'Less payment confusion',
        tone: 'accent',
        icon: 'family',
      },
      {
        title: 'Registration follow-up',
        before: 'Interest, forms, and payment split apart.',
        after: 'Registration and payment stay closer together.',
        tag: 'Fewer handoffs',
        tone: 'brand',
        icon: 'registration',
      },
    ] satisfies SavingsCard[],
  },
  consolidation: {
    title: 'One stack instead of several handoffs.',
    body:
      'The value is simpler upkeep, stronger brand recognition, and a configured connected-account payment path.',
    leftTitle: 'Teams often patch together',
    leftItems: [
      {
        title: 'Messages',
        body: 'A separate place for reminders and announcements.',
      },
      {
        title: 'Payments',
        body: 'Another place to confirm what is complete.',
      },
      {
        title: 'Schedules',
        body: 'Another place to maintain dates and changes.',
      },
      {
        title: 'Forms',
        body: 'Another handoff before a family finishes the next step.',
      },
    ] satisfies ToolItem[],
    rightTitle: 'HuddleWay keeps together',
    rightItems: [
      'Program pages, branding, and offer details',
      'Registration and payment flow',
      'Schedules, updates, and reminders',
      'A client and family app people recognize',
      'A simpler admin rhythm',
    ],
    note:
      'Payment availability, fees, and payout timing depend on the approved agreement and connected-account configuration.',
  },
  cta: {
    eyebrow: 'Simplify The Workflow',
    title: 'See if the workflow is worth simplifying',
    body:
      'Start with the area that creates the most confusion: registration, payments, schedules, or updates.',
  },
};

export const setupFaqPage = {
  pageName: 'setup-faq',
  title: 'Setup FAQ | Launch Your Program App | HuddleWay',
  description:
    'Setup FAQ for youth sports programs considering branded registration, connected-account payments, schedules, and updates.',
  hero: {
    eyebrow: 'Setup FAQ',
    title: 'Know if HuddleWay fits your youth sports program.',
    body:
      'HuddleWay is for clubs, camps, leagues, and training businesses that want a branded app families can use for registration, payments, schedules, and updates.',
  },
  example: {
    eyebrow: 'Family View',
    title: 'What families should understand at first glance.',
    body:
      'They should recognize your brand, understand the offer, and know where to register or pay.',
    bullets: [
      'Your logo and colors stay visible',
      'Dates, fees, and locations are easy to scan',
      'The next step is clear in the same app',
    ],
    mockup: {
      label: 'Illustrative club app',
      theme: 'dark',
      tone: 'brand',
      tilt: 'none',
      asset: mockupAsset('admin/2.png', 'Hand-held team color editor showing branded app customization.'),
    } satisfies PreviewMockup,
  },
  audiencesIntro: {
    title: 'Who HuddleWay is built for',
    body: 'Youth sports programs and training businesses that want cleaner communication, connected payment workflows, and a more recognizable app.',
  },
  audiences: [
    {
      title: 'Club Directors',
      body: 'Run registration, payments, schedules, and updates inside one branded program app.',
    },
    {
      title: 'Camp Leaders',
      body: 'Keep seasonal offers, dates, and parent updates in one branded place designed for families.',
    },
    {
      title: 'League Leaders',
      body: 'Create a more consistent family-facing path across teams, divisions, events, and registrations.',
    },
  ] satisfies Card[],
  setupSteps: [
    {
      title: 'Create your program account',
      body: 'Add the core name, sport, and business details you want families to see.',
    },
    {
      title: 'Add your logo, colors, dates, fees, and locations',
      body: 'Set the branded presentation and the information people need before they act.',
    },
    {
      title: 'Set registration, payment, and update flow',
      body: 'Decide what families can register for, how they pay, and where they check changes.',
    },
    {
      title: 'Review the family preview',
      body: 'Make sure the branded app feels clear before you invite people in.',
    },
  ] satisfies Step[],
  experience: {
    title: 'What your team does and what families get',
    body:
      'The operator work is simple: brand the app, set the flow, and review it. The family benefit is one cleaner place to use.',
    operator: {
      title: 'As the program team',
      bullets: [
        'Keep pages, events, schedules, and updates organized in one place',
        'Set the registration and payment path clearly before launch',
        'Run the workflow without needing a deeply technical setup process',
        'Review the family-facing experience before sharing it',
      ],
    },
    family: {
      title: 'As the family',
      bullets: [
        'Recognize the program immediately',
        'See schedules, updates, pricing, and next steps in one place',
        'Start registration and eligible payment steps from one configured flow',
      ],
    },
  },
  trust: {
    title: 'The practical questions people ask next',
    body:
      'Admin setup is free. If the program will collect payments, confirm processor fees, payout timing, supported payment methods, and program configuration before inviting families.',
    cards: [
      {
        title: 'Connected-account payments',
        body: 'Supported program payment flows use the configured Stripe connected account.',
        tone: 'brand',
      },
      {
        title: 'Brand people recognize',
        body: 'Logo, colors, and program context stay attached to the next step.',
        tone: 'field',
      },
      {
        title: 'Ready before launch',
        body: 'Check the family preview before you share it so the configured path is clear.',
        tone: 'accent',
      },
    ] satisfies Card[],
  },
  faqs: [
    {
      question: 'Is HuddleWay a fit for my type of program?',
      answer:
        'HuddleWay is built for youth sports programs, including clubs, camps, leagues, and training businesses that want one branded app for registration, payments, schedules, and updates.',
    },
    {
      question: 'What does my team have to do before launch?',
      answer:
        'Create a free administrator account, add your logo and program details, set the registration flow, then review what families will see before you share it. Connecting Stripe is optional and only needed if the program chooses to collect payments.',
    },
    {
      question: 'What should families expect?',
      answer: 'Families should expect one branded app where they can review the program, see schedules and updates, understand the next step, and use the configured connected-account payment flow when needed.',
    },
    {
      question: 'How do payments work?',
      answer:
        'Creating and administering a program is free. Supported participant-payment flows use the program’s configured Stripe connected account; platform and processor fees, payout timing, refunds, disputes, and available payment methods must be confirmed in the approved program agreement before launch.',
    },
    {
      question: 'Can I use HuddleWay across multiple teams or divisions?',
      answer:
        'HuddleWay supports tenant-scoped teams, seasons, events, registrations, and roster assignments. Confirm any division hierarchy, household management, or cross-team reporting requirement during setup because those are not represented as universal standalone records in the current release contract.',
    },
    {
      question: 'What should I review before launch?',
      answer:
        'Review the branding, dates, fees, registration step, payment expectations, schedules, and update path so the experience feels clear before you share it.',
    },
    {
      question: 'Do I need to be tech-savvy to use HuddleWay?',
      answer:
        'The free guided setup covers program identity, branding, teams, and navigation. Stripe setup is optional for programs that collect payments. Launch also requires the applicable identity, app-release, and operational checks, so some programs may need assisted setup.',
    },
  ] satisfies FaqItem[],
  cta: {
    eyebrow: 'Check The Fit',
    title: 'Plan the launch before you invite families',
    body:
      'Use the setup page to decide how your brand, payments, schedules, and updates should look in HuddleWay.',
  },
};
