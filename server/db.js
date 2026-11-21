import { getDatabase } from '@netlify/database';

/** Zamienia znaki zapytania `?` na parametry Postgresa `$1, $2, …`. Dane nigdy nie są doklejane do zapytań. */
function toPg(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

function wrap(client) {
  const query = async (sql, params) => (await client.query(toPg(sql), params)).rows;
  return {
    /** Pierwszy wiersz albo `undefined`. */
    get: async (sql, ...params) => (await query(sql, params))[0],
    /** Wszystkie wiersze. */
    all: (sql, ...params) => query(sql, params),
    /** INSERT / UPDATE / DELETE → `{ changes, rows }` (rows niepuste przy RETURNING). */
    run: async (sql, ...params) => {
      const result = await client.query(toPg(sql), params);
      return { changes: result.rowCount ?? 0, rows: result.rows };
    },
  };
}

/**
 * Łączy się z Netlify Database (Postgres). Schemat zakładają migracje z `netlify/database/migrations`
 * (generowane z `db/schema.ts`), stosowane automatycznie przez Netlify przy każdym wdrożeniu.
 */
export async function openDatabase() {
  const { pool } = getDatabase();

  return {
    driver: 'netlify-database',
    ...wrap(pool),

    /** Wykonuje `fn(tx)` w transakcji; wyjątek wycofuje wszystkie zmiany. */
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    close: () => pool.end(),
  };
}

/** Czy błąd to naruszenie ograniczenia UNIQUE. */
export const isUniqueViolation = (err) => err?.code === '23505';
