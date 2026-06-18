export type Link = {
  label: string;
  href: string;
};

export type CallToAction = {
  label: string;
  href: string;
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
  const resolved = normalizedPath === '' ? 'index.html' : `${normalizedPath}.html`;

  return hash ? `${resolved}#${hash}` : resolved;
};

const mockupAsset = (fileName: string, alt: string, fit: 'contain' | 'cover' = 'contain'): NonNullable<PreviewMockup['asset']> => ({
  src: `/mockups/${encodeURIComponent(fileName)}`,
  alt,
  frame: 'none',
  fit,
});

export const siteMeta = {
  name: 'HuddleWay',
  title: 'HuddleWay | Branded Family App for Sports Programs',
  description:
    'HuddleWay gives sports programs a branded family app for schedules, registration, payments, and updates, plus built-in tools to manage pages, events, and program details.',
  footerBlurb:
    'A real app your program can make its own, with built-in tools that help your team save time and keep families on one clear path.',
  previewNoticeLabel: 'Product preview',
  previewNotice:
    'HuddleWay is still under development. App screens and mockups shown throughout this site reflect current builds and are subject to change.',
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
  label: 'Start Setup',
  href: withBase('/setup-faq#setup-steps'),
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
    'Branded family app for sports programs with schedules, signup, payments, updates, and built-in tools to manage the day-to-day work.',
  hero: {
    eyebrow: 'Branded App For Sports Programs',
    title: 'Your program. Your app.',
    body: 'Schedules, signup, payments, and updates in one place.',
  },
  heroPill: 'Launch a branded family app',
  quickChecks: [
    'Your logo',
    'One app',
    'Clear updates',
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
  results: {
    title: 'What your program gets',
    body: 'Less admin. Clearer steps. A stronger brand.',
    cards: [
      {
        value: 'One place',
        title: 'Schedules and updates',
        body: 'Families know where to look.',
        tone: 'brand',
      },
      {
        value: 'Less chasing',
        title: 'Registration and payments',
        body: 'Fewer repeat questions.',
        tone: 'field',
      },
      {
        value: 'Your brand',
        title: 'Front and center',
        body: 'Logo, colors, and name stay visible.',
        tone: 'accent',
      },
    ] satisfies ResultCard[],
  },
  steps: {
    title: 'From setup to live in 3 steps',
    body: 'Upload your brand, add your program, invite families.',
    items: [
      {
        title: 'Set up your program',
        body: 'Add your logo, details, and dates.',
      },
      {
        title: 'Invite families',
        body: 'Share one app and one clear next step.',
      },
      {
        title: 'Run the season',
        body: 'Post schedules and updates.',
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
    title: 'See the app your families will actually use',
    body: 'Families open your program app to check schedules, updates, and registration in one place.',
    bullets: [
      {
        title: 'Your logo and colors',
        body: 'The experience looks like yours from the first tap.',
      },
      {
        title: 'Families stay in your experience',
        body: 'Your brand, your details, and the next step stay together from start to finish.',
      },
      {
        title: 'Built-in tools do more of the work',
        body: 'Your team keeps pages, events, and updates current in one place.',
      },
    ] satisfies Card[],
    note: 'A real app for families. Easier to run for your team.',
    mockup: {
      label: 'Branded club app',
      theme: 'dark',
      tone: 'field',
      tilt: 'none',
      asset: mockupAsset('consumer/4.png', 'Family-facing HuddleWay home screen with featured program highlights.'),
    } satisfies PreviewMockup,
  },
  cta: {
    eyebrow: 'Start Setup',
    title: 'Give your program a real app',
    body: 'Make it your own, give families one place to go, and keep the day-to-day work easier for your team.',
  },
};

export const featuresPage = {
  pageName: 'features',
  title: 'Features | Family App and Program Tools | HuddleWay',
  description:
    'See the HuddleWay features that help sports programs manage pages, events, registration, payments, schedules, and updates in one place.',
  hero: {
    eyebrow: 'Family App Features',
    title: 'Family app features and team tools for sports programs.',
    body:
      'See how HuddleWay helps sports programs keep families in one branded app while managing pages, events, registration, payments, schedules, and updates in one place.',
  },
  overview: {
    title: 'What the HuddleWay family app covers',
    body: 'The built-in tools that help sports programs run the day-to-day work while families get one clear place to go.',
    cards: [
      {
        value: 'Your app',
        title: 'Pages and program details',
        body: 'Your app stays branded and easy to update.',
        tone: 'brand',
      },
      {
        value: 'Built-in tools',
        title: 'Events, registration, and payments',
        body: 'Your team manages the day-to-day work in one place.',
        tone: 'field',
      },
      {
        value: 'Families first',
        title: 'Schedules, updates, and next steps',
        body: 'Families find what they need in one clear app.',
        tone: 'accent',
      },
    ] satisfies ResultCard[],
  },
  showcase: {
    eyebrow: 'See The Experience',
    title: 'One app that feels like your program.',
    body: 'Families stay in your program experience, and your team keeps it up to date from one place.',
    chips: ['Dates and fees', 'Register here', 'See updates'],
    badges: ['Family view', 'Less confusion'],
    mockup: {
      label: 'Family app view',
      theme: 'dark',
      tone: 'brand',
      tilt: 'none',
      asset: mockupAsset('consumer/2.png', 'Branded HuddleWay family app home screen.'),
    } satisfies PreviewMockup,
  },
  indexLinks: [
    { label: 'Setup', href: '#publishing' },
    { label: 'Events', href: '#schedules' },
    { label: 'Registration', href: '#registration' },
    { label: 'Updates', href: '#communication' },
    { label: 'Brand', href: '#branding' },
  ] satisfies Link[],
  sections: [
    {
      id: 'publishing',
      title: 'Pages and program details',
      body: 'Keep dates, fees, locations, and core program pages together.',
      benefit: 'Less time repeating the basics.',
      operatorTitle: 'Your team can',
      operatorItems: [
        'Manage the season overview and key pages',
        'Update core details once',
      ],
      familyTitle: 'Families can',
      familyItems: [
        'See dates and fees fast',
        'Know the next step',
      ],
      mockup: {
        label: 'Program overview',
        theme: 'light',
        tone: 'brand',
        tilt: 'none',
        asset: mockupAsset('admin/1.png', 'Program setup dashboard for team pages and labels.'),
      },
    },
    {
      id: 'schedules',
      title: 'Events and schedules',
      body: 'Keep time, location, and event changes easy to track.',
      benefit: 'Less resending when plans change.',
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
        asset: mockupAsset('consumer/5.png', 'Family-facing coaching staff and upcoming events screen.'),
      },
    },
    {
      id: 'registration',
      title: 'Signup and payment',
      body: 'Keep the action step close to the details.',
      benefit: 'A shorter path from review to action.',
      operatorTitle: 'Your team can',
      operatorItems: [
        'Show the registration step clearly',
        'Keep payment expectations close to signup',
      ],
      familyTitle: 'Families can',
      familyItems: [
        'Review what to do',
        'Finish registration in a clearer flow',
      ],
      mockup: {
        label: 'Registration flow',
        theme: 'light',
        tone: 'accent',
        tilt: 'none',
        asset: mockupAsset('consumer/3.png', 'Hand-held registration flow screen for player signup.'),
      },
    },
    {
      id: 'communication',
      title: 'Updates',
      body: 'Share reminders where families already look.',
      benefit: 'Less digging through old threads.',
      operatorTitle: 'Your team can',
      operatorItems: [
        'Post program updates',
        'Share reminders in context',
      ],
      familyTitle: 'Families can',
      familyItems: [
        'Find updates faster',
        'Understand what changed',
      ],
      mockup: {
        label: 'Updates feed',
        theme: 'dark',
        tone: 'brand',
        tilt: 'none',
        asset: mockupAsset('consumer/6.png', 'Registrant detail sheet with message, email, and call actions.'),
      },
    },
    {
      id: 'branding',
      title: 'Your brand',
      body: 'Keep your logo and colors front and center.',
      benefit: 'A more polished family experience.',
      operatorTitle: 'Your team can',
      operatorItems: [
        'Apply your logo and colors',
        'Keep the experience visually connected',
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
        asset: mockupAsset('admin/2.png', 'Hand-held team color selection screen for brand customization.'),
      },
    },
  ] satisfies FeatureSection[],
  proof: {
    title: 'Built for the workflows sports programs repeat',
    body:
      'No feature sprawl. Just the tools that help sports programs run a branded family app without extra systems in the way.',
  },
  cta: {
    eyebrow: 'Workflow Tour',
    title: 'See the features behind your program app',
    body:
      'Explore pages, events, registration, payments, schedules, and updates in one place.',
  },
};

export const savingsPage = {
  pageName: 'savings',
  title: 'Savings | Fewer Tools for Sports Programs | HuddleWay',
  description:
    'See how HuddleWay helps sports programs reduce tool sprawl, repeated work, and manual follow-up with one family app and built-in team tools.',
  hero: {
    eyebrow: 'Sports Program Savings',
    title: 'Spend less time juggling tools.',
    body:
      'Sports programs save time when schedules, registration, payments, and updates stay in one branded app with built-in team tools.',
  },
  snapshot: {
    title: 'Less wasted time.',
    body: 'Fewer tools to pay for. Less manual cleanup. Easier follow-through for your program.',
  },
  comparison: {
    title: 'Before. After.',
    body: 'What teams stop repeating when the workflow stays together.',
    beforeLabel: 'Without HuddleWay',
    beforeItems: [
      {
        title: 'Updates copied everywhere',
        body: 'The same change gets resent across threads.',
      },
      {
        title: 'Payment status checked elsewhere',
        body: 'What is paid lives in a separate step.',
      },
      {
        title: 'Families bounce between systems',
        body: 'The next step is harder to follow.',
      },
    ] satisfies CompareItem[],
    afterLabel: 'With HuddleWay',
    afterItems: [
      {
        title: 'Post in one clearer place',
        body: 'Families know where to check.',
      },
      {
        title: 'Signup stays connected',
        body: 'Registration and payment stay in the same system.',
      },
      {
        title: 'Give families one path',
        body: 'Brand, details, updates, and next steps stay together.',
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
    eyebrow: 'See It In Practice',
    title: 'Built to lighten the load.',
    body: 'One app to manage. Less cleanup for your team. A clearer experience for families.',
    chips: ['One place to post', 'Less cleanup later', 'Reports easier to pull'],
    badges: ['Team tools', 'Family path'],
    mockup: {
      label: 'Team view',
      theme: 'dark',
      tone: 'field',
      tilt: 'none',
      asset: mockupAsset('admin/4.png', 'Admin staff management screen for multi-team coordination.'),
    } satisfies PreviewMockup,
  },
  timeBack: {
    title: 'Time back.',
    body: 'Common jobs that stop stealing time, including upkeep after launch.',
    cards: [
      {
        title: 'Announcements',
        before: 'Same update, several channels.',
        after: 'One clearer place to post it.',
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
        title: 'Family questions',
        before: 'The same basic questions keep coming.',
        after: 'Families have a clearer place to look.',
        tag: 'Fewer repeat questions',
        tone: 'accent',
        icon: 'family',
      },
      {
        title: 'Registration follow-up',
        before: 'Interest, forms, and payment split apart.',
        after: 'The path to signup stays tighter.',
        tag: 'Fewer handoffs',
        tone: 'brand',
        icon: 'registration',
      },
    ] satisfies SavingsCard[],
  },
  consolidation: {
    title: 'Fewer tools.',
    body:
      'The real value is fewer extra tools to pay for and fewer places to double-check.',
    leftTitle: 'Teams often juggle',
    leftItems: [
      {
        title: 'Messages',
        body: 'A separate place for reminders and announcements.',
      },
      {
        title: 'Payments',
        body: 'Another step to confirm what is complete.',
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
    rightTitle: 'HuddleWay brings together',
    rightItems: [
      'Program details, branded pages, and events',
      'Registration and payment flow',
      'Schedules and updates',
      'A simpler rhythm for upkeep and reporting',
      'One clearer family app',
    ],
    note:
      'Review your current stack before turning this into an exact savings number.',
  },
  cta: {
    eyebrow: 'Simplify The Workflow',
    title: 'See where your program can save time.',
    body:
      'Start with the workflow that creates the most rework in schedules, registration, payments, or updates.',
  },
};

export const setupFaqPage = {
  pageName: 'setup-faq',
  title: 'Setup FAQ | Launch Your Program App | HuddleWay',
  description:
    'Setup FAQ for sports programs that want to launch a branded family app and keep schedules, registration, payments, and updates easy to manage.',
  hero: {
    eyebrow: 'Setup FAQ',
    title: 'Make it yours. Keep it simple.',
    body:
      'Get clear on fit, rollout, and how your team will manage the app before launch.',
  },
  example: {
    eyebrow: 'Illustrative Brand View',
    title: 'See how your program can look inside HuddleWay.',
    body:
      'The goal is simple: families should see your brand, your program details, and the next step in one clear app on the phone.',
    bullets: [
      'Your logo and colors stay visible',
      'Program details and next steps stay together',
      'The family view is easier to follow at a glance',
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
    title: 'Built for program leaders',
    body: 'Clubs, camps, and leagues that want one clear family app and built-in tools for day-to-day work.',
  },
  audiences: [
    {
      title: 'Club Directors',
      body: 'For leaders who want one system to manage pages, events, registration, payments, and family updates.',
    },
    {
      title: 'Camp Leaders',
      body: 'For programs that need one app families can use for schedules, updates, and registration.',
    },
    {
      title: 'League Leaders',
      body: 'For organizations that need a more consistent structure across teams, divisions, events, and family-facing information.',
    },
  ] satisfies Card[],
  setupSteps: [
    {
      title: 'Create your program account',
      body: 'Start with the core name, sport, and program details you need to get moving.',
    },
    {
      title: 'Add your brand and program details',
      body: 'Upload the logo, shape the presentation, and organize the dates, fees, and locations families need first.',
    },
    {
      title: 'Set the family flow',
      body: 'Prepare the schedules, registration, payment expectations, and update paths families will use most often.',
    },
    {
      title: 'Review before launch',
      body: 'Review the live experience carefully so the public-facing path feels clear before you share it.',
    },
  ] satisfies Step[],
  experience: {
    title: 'The app should feel clear for families and easy for your team to run',
    body:
      'A strong rollout gives families one clear place to go and gives your team one simpler way to manage it.',
    operator: {
      title: 'As the program team',
      bullets: [
        'Keep pages, events, schedules, and updates organized in one place',
        'Set the registration and payment path more clearly before launch',
        'Run the day-to-day workflow without needing a deeply technical setup process',
        'Review the public-facing experience before sharing it with families',
      ],
    },
    family: {
      title: 'As the family',
      bullets: [
        'Find the program and understand the basics quickly',
        'See schedules, updates, and next steps in one place on the phone',
        'Follow a more consistent path for registration and payment expectations',
      ],
    },
  },
  trust: {
    title: 'Trust comes from clear steps and controlled access',
    body:
      'Keep the trust language factual: clear next steps, secure activation, controlled access, and a connected registration and payment path.',
    cards: [
      {
        title: 'Clear next steps',
        body: 'Families should know where to register, how to review payment expectations, and where to check for updates.',
        tone: 'brand',
      },
      {
        title: 'Controlled team access',
        body: 'Role-based controls help the right people manage the program.',
        tone: 'field',
      },
      {
        title: 'Ready before launch',
        body: 'Before rollout, check the live details carefully so the family app is ready to share.',
        tone: 'accent',
      },
    ] satisfies Card[],
  },
  faqs: [
    {
      question: 'Is HuddleWay a fit for my type of program?',
      answer:
        'HuddleWay is built for programs that want a real app for families and built-in tools to manage the day-to-day work.',
    },
    {
      question: 'How should I think about setup?',
      answer:
        'Think about setup as a rollout plan: create the program account, add your brand and details, set the family flow, and review the live experience before launch.',
    },
    {
      question: 'What should families expect?',
      answer: 'Families should expect one app where they can review program information, understand the next step, and check for schedules and updates.',
    },
    {
      question: 'What should I review before launch?',
      answer:
        'Review the branding, program details, pages, schedules, registration step, payment expectations, and update paths so the experience feels clear before you share it.',
    },
    {
      question: 'Can I use HuddleWay across multiple teams or divisions?',
      answer:
        'HuddleWay is designed for programs that need a more consistent structure across teams, divisions, events, and family information. Plan the exact setup around how your organization is organized today.',
    },
    {
      question: 'How should I think about the payment step?',
      answer:
        'Treat the payment step as part of the overall family flow. Keep expectations clear, review the experience carefully, and make sure families understand what happens next.',
    },
    {
      question: 'Do I need to be tech-savvy to use HuddleWay?',
      answer:
        'No. HuddleWay is meant to feel straightforward for everyday program teams. The goal is a clear setup, a clear family path, and less manual upkeep once the program is live.',
    },
  ] satisfies FaqItem[],
  cta: {
    eyebrow: 'Rollout Planning',
    title: 'Launch with a plan that feels clear before launch',
    body:
      'Use the setup page to plan a clear family app and a simpler day-to-day workflow before launch.',
  },
};
