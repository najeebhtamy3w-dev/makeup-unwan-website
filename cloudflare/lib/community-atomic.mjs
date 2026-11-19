// Atomic, staging-only D1 primitives for community events.
// Caller must validate approved post / existing poll and authenticated identity.
// Do not expose raw owner fingerprints or call these primitives from public routes without validation.
const types = new Set(['reaction','report','vote']);
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fingerprintPattern = /^[0-9a-f]{32}$/i;
export async function insertCommunityEvent(db,{type,id,owner,choice=null,emoji=null}) {
  if (!db || typeof db.prepare !== 'function') throw new TypeError('D1 required');
  if (!types.has(type) || !idPattern.test(id) || !fingerprintPattern.test(owner)) throw new TypeError('Invalid event identity');
  if (type === 'vote' && ![0,1].includes(choice)) throw new TypeError('Invalid vote');
  if (type === 'reaction' && !['❤️','🌸','✨','👏','💡'].includes(emoji)) throw new TypeError('Invalid reaction');
  if (type !== 'vote' && choice !== null || type !== 'reaction' && emoji !== null) throw new TypeError('Unexpected event field');
  // One vote/report per identity per target; one reaction per emoji per identity.
  // INSERT OR IGNORE + unique PRIMARY KEY is atomic under concurrent requests.
  const discriminator = type === 'reaction' ? emoji : '';
  const result = await db.prepare('INSERT OR IGNORE INTO community_events (kind,target_id,owner_hash,discriminator,choice) VALUES (?,?,?,?,?)')
    .bind(type,id,owner,discriminator,choice).run();
  return {inserted: result.meta?.changes === 1};
}
export async function communityEventCounts(db,{type,id}) {
  if (!types.has(type) || !idPattern.test(id)) throw new TypeError('Invalid query');
  const rows = await db.prepare('SELECT discriminator,choice,COUNT(*) AS count FROM community_events WHERE kind=? AND target_id=? GROUP BY discriminator,choice')
    .bind(type,id).all();
  if (type === 'vote') {
    const counts = [0,0];
    for (const r of rows.results || []) if (r.choice === 0 || r.choice === 1) counts[r.choice] += Number(r.count);
    return counts;
  }
  if (type === 'report') return (rows.results || []).reduce((sum,r)=>sum+Number(r.count),0);
  const counts = Object.fromEntries(['❤️','🌸','✨','👏','💡'].map(e=>[e,0]));
  for (const r of rows.results || []) if (Object.hasOwn(counts,r.discriminator)) counts[r.discriminator] += Number(r.count);
  return counts;
}
