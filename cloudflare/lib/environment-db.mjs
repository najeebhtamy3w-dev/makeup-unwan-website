// Explicit environment-to-database mapping. Never fall back to another database.
// Development is isolated from the existing staging database containing user submissions.
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
  return null;
}

// Non-secret runtime diagnosis for a missing database: names the failing condition and
// reports only WHETHER each expected binding exists. Never returns values, IDs or data.
export function diagnoseAppDatabase(env){
  const mode=deploymentEnv(env);
  const present={DEPLOYMENT_ENV:mode!=='',DEV_DB:env?.DEV_DB!==undefined,STAGING_DB:env?.STAGING_DB!==undefined};
  const expected=mode==='development'?'DEV_DB':mode==='staging'?'STAGING_DB':null;
  let reason=null;
  if(!mode)reason='deployment_env_missing';
  else if(!expected)reason='deployment_env_unrecognized';
  else if(env[expected]===undefined)reason=expected.toLowerCase()+'_not_bound';
  else if(!isD1(env[expected]))reason=expected.toLowerCase()+'_not_d1';
  return reason?{reason,expectedBinding:expected,present}:null;
}
