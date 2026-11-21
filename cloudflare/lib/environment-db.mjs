// Explicit environment-to-database mapping. Never fall back to another database.
// Development is isolated from the existing staging database containing user submissions.
// Production uses ONLY PROD_DB; it never falls back to DEV_DB or STAGING_DB.
const isD1=b=>typeof b?.prepare==='function';

// Tolerates accidental surrounding spaces / capitals typed in the dashboard
// ("development " or "Development"); any other value still maps to NO database.
export function deploymentEnv(env){
  return typeof env?.DEPLOYMENT_ENV==='string'?env.DEPLOYMENT_ENV.trim().toLowerCase():'';
}

export function resolveAppDatabase(env) {
  const mode=deploymentEnv(env);
  if (mode === 'development') return isD1(env.DEV_DB) ? env.DEV_DB : null;
  if (mode === 'staging') return isD1(env.STAGING_DB) ? env.STAGING_DB : null;
  if (mode === 'production') return isD1(env.PROD_DB) ? env.PROD_DB : null;
  return null;
}

// Non-secret runtime diagnosis for a missing database: names the failing condition and
// reports only WHETHER each expected binding exists. Never returns values, IDs or data.
export function diagnoseAppDatabase(env){
  const mode=deploymentEnv(env);
  const has=k=>env?.[k]!==undefined&&env?.[k]!==null&&env?.[k]!=='';
  // ASSETS is injected by Cloudflare into EVERY Pages Function: if it is present while the
  // others are absent, context.env reaches the code and the deployment simply has no settings.
  const present={ASSETS:has('ASSETS'),DEPLOYMENT_ENV:mode!=='',DEV_DB:has('DEV_DB'),STAGING_DB:has('STAGING_DB'),PROD_DB:has('PROD_DB'),
   ADMIN_PASSWORD:has('ADMIN_PASSWORD'),RATE_LIMIT_SALT:has('RATE_LIMIT_SALT')};
  const expected=mode==='development'?'DEV_DB':mode==='staging'?'STAGING_DB':mode==='production'?'PROD_DB':null;
  let reason=null;
  if(!mode)reason='deployment_env_missing';
  else if(!expected)reason='deployment_env_unrecognized';
  else if(env[expected]===undefined)reason=expected.toLowerCase()+'_not_bound';
  else if(!isD1(env[expected]))reason=expected.toLowerCase()+'_not_d1';
  return reason?{reason,expectedBinding:expected,present}:null;
}
