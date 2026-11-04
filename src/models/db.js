import { Pool } from 'pg';

/**
 * Connection pool for PostgreSQL database.
 * 
 * A connection pool maintains a set of reusable database connections
 * to avoid the overhead of creating new connections for each request.
 * This improves performance and reduces load on the database server.
 * 
 * Uses a connection string from environment variables for simplified setup.
 * The connection string format is:
 * postgresql://username:password@host:port/database
 */
const globalForPool = globalThis;
/** @type {import('pg').Pool} */
const sharedPool = globalForPool.__havenSocialPool || new Pool({
    connectionString: process.env.DATABASE_URL || process.env.DB_URL,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000
});
if (process.env.NODE_ENV !== 'production') {
    globalForPool.__havenSocialPool = sharedPool;
}

/**
 * Since we will modify the normal pool object in development mode, we need to create and
 * export a reference to the pool object. This allows us to use the same name for the
 * export regardless of whether we are in development or production mode.
 */
/** @type {import('pg').Pool | { query: import('pg').Pool['query'], close: () => Promise<void> }} */
let db = null;

if (process.env.NODE_ENV === 'development' && process.env.ENABLE_SQL_LOGGING === 'true') {
    /**
     * In development mode, we wrap the pool to provide query logging.
     * This helps with debugging by showing all executed queries in the console.
     * 
     * The wrapper also adds timing information to help identify slow queries
     * and tracks the number of rows affected by each query.
     */
    db = {
        async query(text, params) {
            try {
                const start = Date.now();
                const res = await sharedPool.query(text, params);
                const duration = Date.now() - start;
                console.log('Executed query:', { 
                    text: text.replace(/\s+/g, ' ').trim(), 
                    duration: `${duration}ms`, 
                    rows: res.rowCount 
                });
                return res;
            } catch (error) {
                console.error('Error in query:', { 
                    text: text.replace(/\s+/g, ' ').trim(), 
                    error: error.message 
                });
                throw error;
            }
        },

        async close() {
            await sharedPool.end();
        }
    };
} else {
    // In production, export the pool directly without logging overhead
    db = sharedPool;
}

/**
 * Tests the database connection by executing a simple query.
 */
const testConnection = async() => {
    try {
        const result = await db.query('SELECT NOW() as current_time');
        console.log('Database connection successful:', result.rows[0].current_time);
        return true;
    } catch (error) {
        console.error('Database connection failed:', error.message);
        throw error;
    }
};

export { sharedPool as pool };

export { db };