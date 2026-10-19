// Imported first in main.ts: Sentry has to patch http, express and Nest
// before they load. ConfigModule reads .env only once AppModule is built, so
// the DSN is loaded here too.
import { config } from 'dotenv';
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

config({ quiet: true });

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0,
  profileSessionSampleRate: 1.0,
  profileLifecycle: 'trace',
  // Request bodies carry passwords and resumes, and LLM prompts carry resume
  // text and user queries; neither is sent to Sentry.
  dataCollection: {
    httpBodies: [],
    genAI: { inputs: false, outputs: false },
  },
});
