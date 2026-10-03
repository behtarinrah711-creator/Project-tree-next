export function normalizeAccountNotebook(raw){
  if(!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.lists)) return null;
  const lists = raw.lists.filter(list => list && typeof list === 'object' && !Array.isArray(list) && list.id != null);
  if(!lists.length || lists.length !== raw.lists.length) return null;
  return {
    version: Number(raw.version) || 1,
    activeListId: raw.activeListId == null ? String(lists[0].id) : String(raw.activeListId).slice(0, 128),
    lists,
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export async function readAccountNotebook(pool, accountId){
  const result = await pool.query(
    `SELECT payload, revision, updated_at
       FROM account_notebooks
      WHERE account_id = $1`,
    [accountId],
  );
  if(!result.rowCount) return {notebook: null, revision: 0, updatedAt: null};
  const row = result.rows[0];
  return {notebook: row.payload, revision: Number(row.revision) || 0, updatedAt: row.updated_at};
}

export async function saveAccountNotebook(pool, accountId, notebook, expectedRevision){
  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT revision FROM account_notebooks WHERE account_id = $1 FOR UPDATE`,
      [accountId],
    );
    const revision = Number(current.rows[0]?.revision || 0);
    if(Number(expectedRevision) !== revision){
      await client.query('ROLLBACK');
      const error = new Error('revision_conflict');
      error.statusCode = 409;
      error.revision = revision;
      throw error;
    }
    const saved = await client.query(
      `INSERT INTO account_notebooks(account_id, payload, revision)
       VALUES ($1, $2::jsonb, 1)
       ON CONFLICT (account_id) DO UPDATE
         SET payload = EXCLUDED.payload,
             revision = account_notebooks.revision + 1,
             updated_at = now()
       RETURNING revision, updated_at`,
      [accountId, JSON.stringify(notebook)],
    );
    await client.query('COMMIT');
    return {
      notebook,
      revision: Number(saved.rows[0].revision) || 1,
      updatedAt: saved.rows[0].updated_at,
    };
  }catch(error){
    if(error.statusCode !== 409){
      try{ await client.query('ROLLBACK'); }catch{}
    }
    throw error;
  }finally{
    client.release();
  }
}
