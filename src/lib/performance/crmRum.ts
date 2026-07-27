import {
  publicEnvironment,
  resolveBackendUrl,
  resolveWebsiteCommit,
} from '../config/publicEnvironment';

type Credentials = {
  authorization: string;
  appCheck: string;
};

type RumEntry = PerformanceEntry & {
  duration?: number;
  hadRecentInput?: boolean;
  interactionId?: number;
  value?: number;
};

type RumSample = {
  tenantId: string;
  sampleId: string;
  websiteCommit: string;
  clientClass: 'desktop' | 'mobile';
  lcpMs: number;
  inpMs: number;
  cls: number;
  measuredAt: string;
};

export function startCrmRumCapture(
  tenantId: string,
  credentialsProvider: () => Promise<Credentials>,
) {
  const websiteCommit = resolveWebsiteCommit(publicEnvironment);
  if (
    !websiteCommit
    || typeof window === 'undefined'
    || typeof PerformanceObserver === 'undefined'
    || typeof crypto.randomUUID !== 'function'
  ) return;
  const releaseCommit = websiteCommit;

  const metrics = { lcpMs: 0, inpMs: 0, cls: 0 };
  let interacted = false;
  let sent = false;
  let sample: RumSample | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const observe = (
    type: string,
    callback: (entry: RumEntry) => void,
    durationThreshold?: number,
  ) => {
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => callback(entry as RumEntry));
      });
      observer.observe({
        type,
        buffered: true,
        ...(durationThreshold ? { durationThreshold } : {}),
      } as PerformanceObserverInit);
    } catch {
      // Unsupported metrics are omitted rather than fabricated.
    }
  };

  observe('largest-contentful-paint', (entry) => {
    metrics.lcpMs = Math.max(metrics.lcpMs, entry.startTime || 0);
  });
  observe('layout-shift', (entry) => {
    if (!entry.hadRecentInput) metrics.cls += entry.value || 0;
  });
  observe('event', (entry) => {
    if (entry.interactionId) {
      metrics.inpMs = Math.max(metrics.inpMs, entry.duration || 0);
    }
  }, 16);

  const schedule = (delay = 10_000) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(submit, delay);
  };
  const markInteraction = () => {
    interacted = true;
    if (!sent) schedule();
  };

  async function submit() {
    if (sent || !interacted || metrics.lcpMs <= 0) return;
    sample ??= {
      tenantId,
      sampleId: crypto.randomUUID(),
      websiteCommit: releaseCommit,
      clientClass: innerWidth < 768 ? 'mobile' : 'desktop',
      lcpMs: Math.round(metrics.lcpMs),
      inpMs: Math.round(metrics.inpMs),
      cls: Number(metrics.cls.toFixed(4)),
      measuredAt: new Date().toISOString(),
    };
    try {
      const credentials = await credentialsProvider();
      const response = await fetch(
        `${resolveBackendUrl(publicEnvironment)}/operations/performance/rum`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${credentials.authorization}`,
            ...(credentials.appCheck
              ? { 'X-Firebase-AppCheck': credentials.appCheck }
              : {}),
          },
          body: JSON.stringify(sample),
        },
      );
      sent = response.ok;
    } catch {
      sent = false;
    }
  }

  addEventListener('pointerdown', markInteraction, {
    capture: true,
    passive: true,
  });
  addEventListener('keydown', markInteraction, {
    capture: true,
    passive: true,
  });
}
