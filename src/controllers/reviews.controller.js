const pool = require('../config/db')

// POST /api/reviews — reseña por orden entregada (según ticket US-14)
exports.create = async (req, res) => {
  try {
    const { orderId, sellerId, rating, comment } = req.body
    const buyerId = req.user.userId

    if (!orderId || !sellerId || !rating)
      return res.status(400).json({ error: 'orderId, sellerId y rating son obligatorios' })
    if (!Number.isInteger(Number(rating)) || rating < 1 || rating > 5)
      return res.status(400).json({ error: 'El rating debe ser un entero entre 1 y 5' })
    if (comment && comment.length > 500)
      return res.status(400).json({ error: 'El comentario no puede superar 500 caracteres' })

    // Verificar orden existe y está entregada
    const order = await pool.query(
      'SELECT * FROM orders WHERE order_id = $1', [orderId]
    )
    if (!order.rows.length) return res.status(404).json({ error: 'Orden no encontrada' })
    const ord = order.rows[0]
    if (ord.buyer_id !== buyerId)
      return res.status(403).json({ error: 'No eres el comprador de esta orden' })
    if (ord.status !== 'delivered' && ord.status !== 'completed')
      return res.status(400).json({ error: 'Solo puedes reseñar órdenes entregadas' })

    // Verificar no existe reseña previa para esta orden
    const exists = await pool.query(
      'SELECT review_id FROM reviews WHERE order_id = $1', [orderId]
    )
    if (exists.rows.length)
      return res.status(409).json({ error: 'Ya dejaste una reseña para esta compra' })

    // Obtener productId de la orden
    const productId = ord.product_id

    const result = await pool.query(
      `INSERT INTO reviews (order_id, product_id, buyer_id, seller_id, rating, comment)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [orderId, productId, buyerId, sellerId, Number(rating), comment || null]
    )
    const rev = result.rows[0]
    return res.status(201).json({
      reviewId: rev.review_id, sellerId: rev.seller_id,
      rating: rev.rating, comment: rev.comment, createdAt: rev.created_at
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// GET /api/users/:userId/reviews — reseñas del vendedor con paginación
exports.getBySeller = async (req, res) => {
  try {
    const { userId } = req.params
    let { page = 1, limit = 10 } = req.query
    page = parseInt(page); limit = parseInt(limit)

    // Verificar usuario existe
    const user = await pool.query('SELECT user_id, reputation FROM users WHERE user_id = $1', [userId])
    if (!user.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' })

    const countRes = await pool.query('SELECT COUNT(*) FROM reviews WHERE seller_id = $1', [userId])
    const total = parseInt(countRes.rows[0].count)
    const offset = (page - 1) * limit

    const result = await pool.query(
      `SELECT r.review_id, r.rating, r.comment, r.created_at, r.helpful,
              u.name AS buyer_name, p.title AS product_title
       FROM reviews r
       JOIN users u ON u.user_id = r.buyer_id
       LEFT JOIN products p ON p.product_id = r.product_id
       WHERE r.seller_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    )
    return res.status(200).json({
      sellerId: userId,
      reputation: parseFloat(user.rows[0].reputation),
      totalReviews: total,
      data: result.rows.map(r => ({
        reviewId: r.review_id, rating: r.rating, comment: r.comment,
        buyerName: r.buyer_name, productTitle: r.product_title,
        helpful: r.helpful || 0, createdAt: r.created_at
      }))
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// GET /api/reviews/product/:productId
exports.getByProduct = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.review_id, r.rating, r.comment, r.created_at, r.helpful,
              u.name AS buyer_name, u.user_id AS buyer_id
       FROM reviews r JOIN users u ON u.user_id = r.buyer_id
       WHERE r.product_id = $1 ORDER BY r.created_at DESC`,
      [req.params.productId]
    )
    return res.status(200).json(result.rows)
  } catch (err) {
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// PATCH /api/reviews/:reviewId/helpful
exports.markHelpful = async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE reviews SET helpful = helpful + 1 WHERE review_id = $1 RETURNING helpful',
      [req.params.reviewId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Reseña no encontrada' })
    return res.status(200).json({ helpful: result.rows[0].helpful })
  } catch (err) {
    return res.status(500).json({ error: 'Error del servidor' })
  }
}
