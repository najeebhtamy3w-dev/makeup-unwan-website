// D1-backed atomic fixed-window rate limiter for Cloudflare staging.
// A fixed window differs from the Netlify sliding-window implementation;
// acceptance tests must verify agreed security/traffic behavior before deployment.
export async function checkRateLimit(db,{scope,bucket,limit,windowMs,now=Date.now()}) {
  if (!db?.prepare || !/^[a-z0-9-]{1,50}$/.test(scope) || !/^[a-f0-9]{16,64}$/.test(bucket)) throw new TypeError('Invalid limiter identity');
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1000) throw new TypeError('Invalid rate limit');
  const windowStart = Math.floor(now/windowMs)*windowMs;
  // Single upsert with a conditional increment avoids read-then-write races.
  const result = await db.prepare(`INSERT INTO rate_windows(scope,bucket,window_start,hits) VALUES (?,?,?,1)
    ON CONFLICT(scope,bucket,window_start) DO UPDATE SET hits=hits+1 WHERE hits < ?`)
    .bind(scope,bucket,windowStart,limit).run();
  const allowed = result.meta?.changes === 1;
  return {allowed,retryAfter:allowed?0:Math.max(1,Math.ceil((windowStart+windowMs-now)/1000))};
}
