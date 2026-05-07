const pool = require('../config/db')

// POST /api/orders — crear órdenes desde carrito
exports.create = async (req, res) => {
  const client = await pool.connect()
  try {
    const buyerId = req.user.userId
    await client.query('BEGIN')

    const items = await client.query(
      `SELECT ci.product_id, p.seller_id, p.status
       FROM cart_items ci
       JOIN carts c ON c.cart_id = ci.cart_id
       JOIN products p ON p.product_id = ci.product_id
       WHERE c.user_id = $1`,
      [buyerId]
    )
    if (!items.rows.length) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'El carrito está vacío' })
    }

    const invalid = items.rows.filter(i => i.status !== 'active' || i.seller_id === buyerId)
    if (invalid.length) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'El carrito contiene productos no disponibles o productos propios' })
    }

    const created = []
    for (const item of items.rows) {
      const dup = await client.query(
        `SELECT order_id FROM orders WHERE product_id = $1 AND buyer_id = $2 AND status = 'pending'`,
        [item.product_id, buyerId]
      )
      if (dup.rows.length) continue

      const r = await client.query(
        `INSERT INTO orders (product_id, buyer_id, seller_id) VALUES ($1,$2,$3) RETURNING *`,
        [item.product_id, buyerId, item.seller_id]
      )
      created.push(r.rows[0])
    }

    await client.query(
      'DELETE FROM cart_items WHERE cart_id = (SELECT cart_id FROM carts WHERE user_id = $1)',
      [buyerId]
    )
    await client.query('COMMIT')
    return res.status(201).json(created)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  } finally {
    client.release()
  }
}

// POST /api/orders/single — crear orden para un solo producto
exports.createSingle = async (req, res) => {
  try {
    const { productId } = req.body
    const buyerId = req.user.userId
    if (!productId) return res.status(400).json({ error: 'productId es obligatorio' })

    const prod = await pool.query(
      `SELECT * FROM products WHERE product_id = $1 AND status = 'active'`, [productId]
    )
    if (!prod.rows.length) return res.status(404).json({ error: 'Producto no encontrado o no disponible' })
    if (prod.rows[0].seller_id === buyerId)
      return res.status(400).json({ error: 'No puedes comprar tu propio producto' })

    const existing = await pool.query(
      `SELECT order_id FROM orders WHERE product_id = $1 AND buyer_id = $2 AND status = 'pending'`,
      [productId, buyerId]
    )
    if (existing.rows.length)
      return res.status(400).json({ error: 'Ya tienes una solicitud activa para este producto' })

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

// GET /api/orders/my — historial del comprador con filtro opcional por status
exports.myOrders = async (req, res) => {
  try {
    const { status } = req.query
    const params = [req.user.userId]
    let filter = ''
    if (status) {
      params.push(status)
      filter = `AND o.status = $2`
    }

    const result = await pool.query(
      `SELECT o.order_id, o.status, o.created_at, p.title AS product_title, p.price,
              u.name AS seller_name,
              (SELECT url FROM product_images WHERE product_id = p.product_id ORDER BY position LIMIT 1) AS image_url
       FROM orders o
       JOIN products p ON p.product_id = o.product_id
       JOIN users u ON u.user_id = o.seller_id
       WHERE o.buyer_id = $1 ${filter}
       ORDER BY o.created_at DESC`,
      params
    )
    return res.status(200).json(result.rows)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// PATCH /api/orders/:orderId — actualizar estado (seller acepta/rechaza)
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

// PATCH /api/orders/:orderId/status — transiciones estrictas pending→confirmed→delivered
exports.changeStatus = async (req, res) => {
  try {
    const { orderId } = req.params
    const { status } = req.body
    const userId = req.user.userId

    const TRANSITIONS = {
      pending:   ['confirmed', 'cancelled'],
      confirmed: ['delivered', 'cancelled'],
      delivered: [],
      completed: [],
      cancelled: []
    }

    const order = await pool.query('SELECT * FROM orders WHERE order_id = $1', [orderId])
    if (!order.rows.length) return res.status(404).json({ error: 'Orden no encontrada' })
    const o = order.rows[0]

    if (o.seller_id !== userId && o.buyer_id !== userId)
      return res.status(403).json({ error: 'No tienes permiso sobre esta orden' })

    const allowed = TRANSITIONS[o.status] || []
    if (!allowed.includes(status))
      return res.status(400).json({ error: `Transición inválida: ${o.status} → ${status}` })

    const result = await pool.query(
      `UPDATE orders SET status = $1 WHERE order_id = $2 RETURNING *`, [status, orderId]
    )
    return res.status(200).json(result.rows[0])
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}
