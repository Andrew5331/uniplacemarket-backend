const pool = require('../config/db')

// GET /api/notifications
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.userId
    const { type, read } = req.query

    const conditions = ['user_id = $1']
    const values = [userId]
    let idx = 2

    if (type) { conditions.push(`type = $${idx++}`); values.push(type) }
    if (read !== undefined) { conditions.push(`read = $${idx++}`); values.push(read === 'true') }

    const where = 'WHERE ' + conditions.join(' AND ')

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT notification_id, type, message, resource_id, resource_type, read, created_at
         FROM notifications ${where} ORDER BY created_at DESC`,
        values
      ),
      pool.query('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = FALSE', [userId])
    ])

    return res.status(200).json({
      data: dataRes.rows.map(n => ({
        notificationId: n.notification_id,
        type: n.type,
        message: n.message,
        resourceId: n.resource_id,
        resourceType: n.resource_type,
        read: n.read,
        createdAt: n.created_at
      })),
      unreadCount: parseInt(countRes.rows[0].count)
    })
  } catch (err) {
    console.error('[notifications.getNotifications]', err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// PATCH /api/notifications/:notificationId/read
exports.markRead = async (req, res) => {
  try {
    const { notificationId } = req.params
    const userId = req.user.userId

    const result = await pool.query(
      'UPDATE notifications SET read = TRUE WHERE notification_id = $1 AND user_id = $2 RETURNING notification_id',
      [notificationId, userId]
    )
    if (!result.rows.length)
      return res.status(404).json({ error: 'Notificación no encontrada' })

    return res.status(200).json({ notificationId: result.rows[0].notification_id, read: true })
  } catch (err) {
    console.error('[notifications.markRead]', err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// PATCH /api/notifications/read-all
exports.markAllRead = async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read = TRUE WHERE user_id = $1', [req.user.userId])
    return res.status(200).json({ updated: true })
  } catch (err) {
    console.error('[notifications.markAllRead]', err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}
