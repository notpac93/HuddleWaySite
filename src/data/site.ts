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
  title: 'HuddleWay | $0/Month Sports Program Software',
  description:
    'Run your sports program for $0/month with registration, payments, schedules, updates, and your brand in one app.',
  footerBlurb:
    'Save money. Save time. Look professional. Run your sports program for $0/month in one branded app.',

};

export const navigation: Link[] = [
  { label: 'Home', href: withBase('/') },
  { label: 'Features', href: withBase('/features') },
  { label: 'Pricing & Savings', href: withBase('/savings') },
  { label: 'Setup FAQ', href: withBase('/setup-faq') },
];

export const trustLinks: Link[] = [
  { label: 'Support', href: withBase('/support') },
  { label: 'Privacy', href: withBase('/privacy') },
  { label: 'Terms', href: withBase('/terms') },
];

export const primaryCta: CallToAction = {
  label: 'Start Free',
  href: 'https://apps.apple.com/us/app/huddleway-admin/id6761773042',
  prompt: 'app-store-choice',
};

export const appStorePrompt: AppStorePrompt = {
  title: 'How will you use HuddleWay?',
  body: 'Choose whether you run a program or are joining as a family.',
  admin: {
    label: 'Run a Program',
    href: 'https://apps.apple.com/us/app/huddleway-admin/id6761773042',
    note: 'Open HuddleWay for program owners in the App Store.',
  },
  family: {
    label: 'Join as a Family',
    note: 'The family App Store link is coming soon.',
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
    'Run your sports program for $0/month. Save money, save time, and look professional with one branded app.',
  hero: {
    eyebrow: 'For Youth Sports Programs',
    price: '$0',
    cadence: '/month',
    title: 'to run your sports program.',
    promise: 'Save money. Save time. Look professional.',
    body: 'Registration, payments, schedules, and updates—all in one branded app.',
  },
  heroPill: 'For clubs, leagues, camps, and training programs.',
  quickChecks: [
    'No monthly software bill',
    '$1 maximum HuddleWay fee',
    'No ads',
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
    eyebrow: 'See It In Action',
    title: 'Run your program from one place.',
    videos: [
      {
        title: 'HuddleWay for program owners',
        body: 'Manage schedules, registration, payments, and updates from one clear workspace. Availability depends on your program and released app version.',
        src: '/mockups/admin/huddleway-admin-new-ios-app.mp4',
        label: 'HuddleWay Admin new iOS app deployment animation.',
      },
    ] satisfies DeploymentAnimation[],
  },
  results: {
    title: 'Save money. Save time. Look professional.',
    body: 'The three things that matter most when you run a sports program.',
    cards: [
      {
        value: '$0/month',
        title: 'Keep more of what you earn',
        body: 'Run your program without adding another recurring software bill.',
        tone: 'brand',
      },
      {
        value: 'One place',
        title: 'Spend less time on busywork',
        body: 'Keep registration, payments, schedules, and updates together.',
        tone: 'field',
      },
      {
        value: 'Your brand',
        title: 'Look professional from day one',
        body: 'Give families one polished place with your logo, colors, and program information.',
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
        body: 'Once your program is ready, invite families to register, pay, check schedules, and get updates.',
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
        body: 'Post updates alongside schedules and offers in the family app.',
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
    eyebrow: 'Start At $0/Month',
    title: 'Run your program without another monthly bill',
    body: 'Save money, save time, and give families a professional experience they can trust.',
  },
};

export const featuresPage = {
  pageName: 'features',
  title: 'Features | Youth Sports Program App | HuddleWay',
  description:
    'See how HuddleWay brings your brand, registration, payments, schedules, and updates into one clear app.',
  hero: {
    eyebrow: 'How HuddleWay Works',
    title: 'What your youth sports program can run inside HuddleWay.',
    body:
      'Use one branded app to present your program, take registrations and payments, post schedules, and share updates with clients and families.',
  },
  overview: {
    title: 'What HuddleWay actually helps you do',
    body: 'See what your team can run and what families can do in one place.',
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
        body: 'Give people one branded starting point for schedules, payments, updates, and next steps.',
        tone: 'field',
      },
      {
        value: 'Your team controls',
        title: 'Brand, content, and activity',
        body: 'Update pages, events, fees, and announcements from one place.',
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
        'Publish your current offer when it is ready',
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
      benefit: 'One place to publish the current schedule.',
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
      title: 'Registration and payments',
      body: 'Let families register and pay your program in a cleaner branded flow.',
      benefit: 'A clearer path from registration to payment.',
      operatorTitle: 'Your team can',
      operatorItems: [
        'Set pricing and payment expectations clearly',
        'Collect program payments through your connected Stripe account',
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
      body: 'Post reminders, changes, and next steps in the branded family app.',
      benefit: 'One branded place for announcements and changes.',
      operatorTitle: 'Your team can',
      operatorItems: [
        'Share reminders and changes in one branded place',
        'Keep the current announcement easy to find',
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
    title: 'Built for the work youth programs repeat',
    body: 'HuddleWay is for programs that want their own brand, simpler payments, and easier day-to-day communication.',
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
  title: 'Pricing & Savings | $0/Month | HuddleWay',
  description:
    'See how a $0/month HuddleWay software bill can save your sports program money and time while helping it look professional.',
  hero: {
    eyebrow: 'Simple Pricing',
    price: '$0/month',
    title: 'Run your program without a software bill.',
    body: 'Save money, save time, and give families one professional place to register, pay, see schedules, and get updates.',
  },
  snapshot: {
    title: '$1 is the most HuddleWay earns on a payment.',
    body: 'There is no recurring HuddleWay software subscription. When money is collected through a qualifying HuddleWay payment, the HuddleWay fee never exceeds $1. Standard processing fees and payment terms are separate.',
  },
  comparison: {
    title: 'A simpler way to run the business',
    body: 'Compare another monthly software bill with one branded app that starts at $0/month.',
    beforeLabel: 'The usual way',
    beforeItems: [
      {
        title: 'Pay before the season starts',
        body: 'Monthly subscriptions and add-ons cost money before a family registers.',
      },
      {
        title: 'Jump between tools',
        body: 'Registration, payments, schedules, and messages live in different places.',
      },
      {
        title: 'Look like everyone else',
        body: 'Families see a generic experience instead of your program.',
      },
    ] satisfies CompareItem[],
    afterLabel: 'The HuddleWay way',
    afterItems: [
      {
        title: 'Start at $0/month',
        body: 'Run your program without a recurring HuddleWay software subscription.',
      },
      {
        title: 'Keep everything together',
        body: 'Give your team and families one clear place to get things done.',
      },
      {
        title: 'Put your name on it',
        body: 'Your logo, colors, and program information stay front and center.',
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
    eyebrow: 'The Three Big Benefits',
    title: 'Spend less. Do less. Look professional.',
    body: 'HuddleWay gives business owners a lower-cost, easier way to run the program while giving families a polished experience they can trust.',
    chips: ['Save money', 'Save time', 'Your brand'],
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
    title: 'Less busywork. More time for the program.',
    body: 'Put the work your team repeats most often into one place.',
    cards: [
      {
        title: 'Announcements',
        before: 'Same update, several channels.',
        after: 'Post once in HuddleWay.',
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
    title: 'Replace a pile of tools with one clear app.',
    body: 'Spend less time maintaining software and give families one place they can recognize.',
    leftTitle: 'What programs patch together',
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
      'Program pages, your brand, and offers',
      'Registration and payments',
      'Schedules, updates, and reminders',
      'One family app people recognize',
      'A simpler way to run the program',
    ],
    note: 'Payment processing fees, availability, and payout timing depend on your Stripe setup and payment terms.',
  },
  cta: {
    eyebrow: 'Start At $0/Month',
    title: 'Stop paying just to run your program',
    body: 'Save money, save time, and look professional with one branded app.',
  },
};

export const setupFaqPage = {
  pageName: 'setup-faq',
  title: 'Setup FAQ | Launch Your Program App | HuddleWay',
  description:
    'Simple answers about HuddleWay pricing, setup, payments, schedules, updates, and branding for sports programs.',
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
        'Register and make payments from one clear place',
      ],
    },
  },
  trust: {
    title: 'The practical questions people ask next',
    body: 'Your recurring HuddleWay software cost is $0/month. If you collect payments, review processing fees, payout timing, and payment options before inviting families.',
    cards: [
      {
        title: '$1 maximum HuddleWay fee',
        body: 'The HuddleWay fee never exceeds $1 on a qualifying payment. Standard processing fees are separate.',
        tone: 'brand',
      },
      {
        title: 'Brand people recognize',
        body: 'Logo, colors, and program context stay attached to the next step.',
        tone: 'field',
      },
      {
        title: 'Ready before launch',
        body: 'Check the family preview before you share it so every next step is clear.',
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
      question: 'How much does HuddleWay cost my program?',
      answer:
        'Your recurring HuddleWay software cost is $0/month. When you collect a qualifying payment through HuddleWay, the HuddleWay fee never exceeds $1. Standard payment-processing fees and your program’s payment terms are separate.',
    },
    {
      question: 'What should families expect?',
      answer: 'Families get one branded app where they can review the program, see schedules and updates, understand the next step, and make payments when needed.',
    },
    {
      question: 'How do payments work?',
      answer: 'Payments are processed through your connected Stripe account. The HuddleWay fee never exceeds $1 on a qualifying payment. Standard Stripe processing fees, refunds, disputes, payout timing, and available payment methods are separate.',
    },
    {
      question: 'Does HuddleWay show ads?',
      answer: 'No. HuddleWay does not show third-party ads in its current iOS apps.',
    },
    {
      question: 'Can I use HuddleWay across multiple teams or divisions?',
      answer: 'HuddleWay supports teams, seasons, events, registrations, and roster assignments within your program. If you need a special division structure, household setup, or cross-team report, confirm that requirement during setup.',
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
