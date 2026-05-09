const pool = require('../config/db')

async function createNotification({ userId, type, message, resourceId, resourceType }) {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, type, message, resource_id, resource_type) VALUES ($1,$2,$3,$4,$5)',
      [userId, type, message, resourceId || null, resourceType || null]
    )
  } catch (err) {
    console.error('[notify] error:', err.message)
  }
}

module.exports = { createNotification }
