import assert from 'node:assert/strict';
import {resolveAppDatabase,diagnoseAppDatabase} from '../lib/environment-db.mjs';
import {onRequestGet} from '../../functions/api/health.js';
const development={prepare(){return {first:async()=>({ok:1})}}};
const staging={prepare(){return {first:async()=>({ok:1})}}};
assert.equal(resolveAppDatabase({DEPLOYMENT_ENV:'development',DEV_DB:development,STAGING_DB:staging}),development);
assert.equal(resolveAppDatabase({DEPLOYMENT_ENV:'staging',DEV_DB:development,STAGING_DB:staging}),staging);
assert.equal(resolveAppDatabase({DEPLOYMENT_ENV:'development',STAGING_DB:staging}),null,'never fall back to staging');
assert.equal(resolveAppDatabase({DEPLOYMENT_ENV:'staging',DEV_DB:development}),null,'never fall back to development');
assert.equal(resolveAppDatabase({DEPLOYMENT_ENV:'production',DEV_DB:development,STAGING_DB:staging}),null);
assert.equal((await onRequestGet({env:{DEPLOYMENT_ENV:'development',DEV_DB:development}})).status,200);
assert.equal((await onRequestGet({env:{DEPLOYMENT_ENV:'development',STAGING_DB:staging}})).status,503);
// Development uses ONLY DEV_DB, even when STAGING_DB is also bound to the same project.
for(const mode of ['development','development ',' Development','DEVELOPMENT'])
 assert.equal(resolveAppDatabase({DEPLOYMENT_ENV:mode,DEV_DB:development,STAGING_DB:staging}),development,'dev -> DEV_DB for '+JSON.stringify(mode));
for(const mode of [undefined,'','dev','develop','preview','production','prod'])
 assert.equal(resolveAppDatabase({DEPLOYMENT_ENV:mode,DEV_DB:development,STAGING_DB:staging}),null,'no DB for '+JSON.stringify(mode));
assert.equal(resolveAppDatabase({DEPLOYMENT_ENV:'development',DEV_DB:{},STAGING_DB:staging}),null,'non-D1 DEV_DB is refused, staging never used');
assert.equal(resolveAppDatabase({DEPLOYMENT_ENV:'development',DEV_DB:'makeup-unwan-dev-test',STAGING_DB:staging}),null,'a text variable named DEV_DB is not a binding');
// Diagnosis names the failing condition and only reports presence, never values.
const diag=env=>diagnoseAppDatabase(env);
assert.equal(diag({DEPLOYMENT_ENV:'development',DEV_DB:development}),null);
assert.deepEqual(diag({DEV_DB:development,STAGING_DB:staging}),{reason:'deployment_env_missing',expectedBinding:null,present:{DEPLOYMENT_ENV:false,DEV_DB:true,STAGING_DB:true}});
assert.equal(diag({DEPLOYMENT_ENV:'preview',DEV_DB:development}).reason,'deployment_env_unrecognized');
assert.deepEqual(diag({DEPLOYMENT_ENV:'development',STAGING_DB:staging}),{reason:'dev_db_not_bound',expectedBinding:'DEV_DB',present:{DEPLOYMENT_ENV:true,DEV_DB:false,STAGING_DB:true}});
assert.equal(diag({DEPLOYMENT_ENV:'development',DEV_DB:'makeup-unwan-dev-test'}).reason,'dev_db_not_d1');
const leaked=JSON.stringify(diag({DEPLOYMENT_ENV:'development',DEV_DB:'secret-db-id-123',STAGING_DB:staging,ADMIN_PASSWORD:'p'.repeat(20)}));
assert.ok(!leaked.includes('secret-db-id-123')&&!leaked.includes('ppppp'),'diagnosis must not echo values');
const health=await onRequestGet({env:{DEPLOYMENT_ENV:'development',STAGING_DB:staging}});
assert.equal((await health.json()).database.reason,'dev_db_not_bound');
console.log('PASS D1 development/staging isolation, safe refusal and non-secret diagnosis');
