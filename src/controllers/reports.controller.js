const pool = require('../config/db')

// POST /api/reports
exports.create = async (req, res) => {
  try {
    const { targetId, targetType, reason, description } = req.body
    const reporterId = req.user.userId

    if (!targetId || !targetType || !reason) {
      return res.status(400).json({ error: 'Datos inválidos', details: ['targetId, targetType y reason son obligatorios'] })
    }
    if (!['product', 'user'].includes(targetType)) {
      return res.status(400).json({ error: 'Datos inválidos', details: ["targetType debe ser 'product' o 'user'"] })
    }
    if (!['spam', 'inappropriate', 'fake', 'other'].includes(reason)) {
      return res.status(400).json({ error: 'Datos inválidos', details: ["reason debe ser 'spam', 'inappropriate', 'fake' u 'other'"] })
    }
    if (description && description.length > 500) {
      return res.status(400).json({ error: 'Datos inválidos', details: ['description no puede superar 500 caracteres'] })
    }

    if (targetType === 'product') {
      const { rows } = await pool.query(
        `SELECT product_id FROM products WHERE product_id = $1 AND status != 'deleted'`,
        [targetId]
      )
      if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' })
    } else if (targetType === 'user') {
      const { rows } = await pool.query(
        `SELECT user_id FROM users WHERE user_id = $1`,
        [targetId]
      )
      if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    const result = await pool.query(
      `INSERT INTO reports (reporter_id, target_id, target_type, reason, description)
       VALUES ($1,$2,$3,$4,$5) RETURNING report_id, created_at`,
      [reporterId, targetId, targetType, reason, description || null]
    )
    const report = result.rows[0]
    return res.status(201).json({
      reportId: report.report_id,
      targetId,
      targetType,
      reason,
      status: 'pending',
      createdAt: report.created_at,
    })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un reporte tuyo para este elemento' })
    }
    console.error('[reports.create]', err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}
