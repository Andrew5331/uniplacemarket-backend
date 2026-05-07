const { Pool } = require('pg')
require('dotenv').config()

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        max: 10,
      }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        max: 10,
      }
)

pool.connect((err) => {
  if (err) console.error('❌ Error conectando a PostgreSQL:', err.message)
  else console.log('✅ Conectado a PostgreSQL')
})

module.exports = pool
