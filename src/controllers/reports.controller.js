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
