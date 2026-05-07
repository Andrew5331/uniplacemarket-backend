const pool = require('../config/db')

// POST /api/orders
exports.create = async (req, res) => {
  try {
    const { productId } = req.body
    const buyerId = req.user.userId
    if (!productId) return res.status(400).json({ error: 'productId es obligatorio' })

    const prod = await pool.query(
      `SELECT * FROM products WHERE product_id = $1 AND status = 'active'`, [productId]
    )
    if (!prod.rows.length) return res.status(404).json({ error: 'Producto no encontrado o no disponible' })
    if (prod.rows[0].seller_id === buyerId) return res.status(400).json({ error: 'No puedes comprar tu propio producto' })

    const existing = await pool.query(
      `SELECT order_id FROM orders WHERE product_id = $1 AND buyer_id = $2 AND status = 'pending'`,
      [productId, buyerId]
    )
    if (existing.rows.length) return res.status(400).json({ error: 'Ya tienes una solicitud activa para este producto' })

    const result = await pool.query(
      `INSERT INTO orders (product_id, buyer_id, seller_id) VALUES ($1,$2,$3) RETURNING *`,
      [productId, buyerId, prod.rows[0].seller_id]
    )
    return res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// GET /api/orders/my — compras del usuario
exports.myOrders = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.order_id, o.status, o.created_at, p.title AS product_title, p.price,
              u.name AS seller_name,
              (SELECT url FROM product_images WHERE product_id = p.product_id ORDER BY position LIMIT 1) AS image_url
       FROM orders o
       JOIN products p ON p.product_id = o.product_id
       JOIN users u ON u.user_id = o.seller_id
       WHERE o.buyer_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.userId]
    )
    return res.status(200).json(result.rows)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// PATCH /api/orders/:orderId — seller acepta/rechaza
exports.updateStatus = async (req, res) => {
  try {
    const { orderId } = req.params
    const { status } = req.body
    const allowed = ['confirmed', 'cancelled', 'delivered', 'completed']
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Estado inválido' })

    const order = await pool.query('SELECT * FROM orders WHERE order_id = $1', [orderId])
    if (!order.rows.length) return res.status(404).json({ error: 'Orden no encontrada' })
    if (order.rows[0].seller_id !== req.user.userId && order.rows[0].buyer_id !== req.user.userId)
      return res.status(403).json({ error: 'No tienes permiso sobre esta orden' })

    const result = await pool.query(
      `UPDATE orders SET status = $1 WHERE order_id = $2 RETURNING *`, [status, orderId]
    )
    return res.status(200).json(result.rows[0])
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}
