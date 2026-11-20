// Explicit environment-to-database mapping. Never fall back to another database.
// Development is isolated from the existing staging database containing user submissions.
export function resolveAppDatabase(env) {
  if (env?.DEPLOYMENT_ENV === 'development') {
    return env.DEV_DB?.prepare ? env.DEV_DB : null;
  }
  if (env?.DEPLOYMENT_ENV === 'staging') {
    return env.STAGING_DB?.prepare ? env.STAGING_DB : null;
  }
  return null;
}
