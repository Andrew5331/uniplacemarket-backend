const pool = require('../config/db')
const { createNotification } = require('../helpers/notify')

// POST /api/orders — crear órdenes desde carrito
exports.create = async (req, res) => {
  const client = await pool.connect()
  try {
    const buyerId = req.user.userId
    const { cartId } = req.body
    console.log('[orders.create] buyerId:', buyerId, 'cartId:', cartId)

    await client.query('BEGIN')

    let itemsQuery, itemsParams
    if (cartId) {
      itemsQuery = `SELECT ci.product_id, ci.quantity, p.seller_id, p.status, p.price
                    FROM cart_items ci
                    JOIN carts c ON c.cart_id = ci.cart_id
                    JOIN products p ON p.product_id = ci.product_id
                    WHERE ci.cart_id = $1 AND c.user_id = $2`
      itemsParams = [cartId, buyerId]
    } else {
      itemsQuery = `SELECT ci.product_id, ci.quantity, p.seller_id, p.status, p.price
                    FROM cart_items ci
                    JOIN carts c ON c.cart_id = ci.cart_id
                    JOIN products p ON p.product_id = ci.product_id
                    WHERE c.user_id = $1`
      itemsParams = [buyerId]
    }

    const items = await client.query(itemsQuery, itemsParams)
    console.log('[orders.create] items found:', items.rows.length, JSON.stringify(items.rows))

    if (!items.rows.length) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'El carrito está vacío' })
    }

    items.rows.forEach(i => {
      const reasons = []
      if (i.status !== 'active') reasons.push(`status="${i.status}"`)
      if (i.seller_id === buyerId) reasons.push('own product')
      console.log(`[orders.create] item product_id=${i.product_id} seller_id=${i.seller_id} status=${i.status} reasons=[${reasons.join(',')}]`)
    })

    const invalid = items.rows.filter(i => i.status !== 'active' || i.seller_id === buyerId)
    if (invalid.length) {
      console.log('[orders.create] invalid items count:', invalid.length)
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'El carrito contiene productos no disponibles o productos propios' })
    }

    const created = []
    for (const item of items.rows) {
      const dup = await client.query(
        `SELECT order_id FROM orders WHERE product_id = $1 AND buyer_id = $2 AND status = 'pending'`,
        [item.product_id, buyerId]
      )
      if (dup.rows.length) {
        console.log('[orders.create] dup skip product_id:', item.product_id)
        continue
      }

      const r = await client.query(
        `INSERT INTO orders (product_id, buyer_id, seller_id, price) VALUES ($1,$2,$3,$4) RETURNING *`,
        [item.product_id, buyerId, item.seller_id, item.price]
      )
      created.push(r.rows[0])

      await client.query('UPDATE products SET stock = stock - $1 WHERE product_id = $2', [item.quantity, item.product_id])
      await client.query("UPDATE products SET status = 'sold' WHERE product_id = $1 AND stock <= 0", [item.product_id])
      createNotification({ userId: item.seller_id, type: 'purchase', message: 'Tienes una nueva solicitud de compra para tu producto', resourceId: r.rows[0].order_id, resourceType: 'order' })
    }

    if (cartId) {
      await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId])
    } else {
      await client.query(
        'DELETE FROM cart_items WHERE cart_id = (SELECT cart_id FROM carts WHERE user_id = $1)',
        [buyerId]
      )
    }

    await client.query('COMMIT')
    console.log('[orders.create] created:', created.length)
    return res.status(201).json(created)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[orders.create] message:', err.message)
    console.error('[orders.create] stack:', err.stack)
    console.error('[orders.create] detail:', err.detail)
    return res.status(500).json({ error: 'Error del servidor' })
  } finally {
    client.release()
  }
}

// POST /api/orders/single — crear orden para un solo producto
exports.createSingle = async (req, res) => {
  try {
    const { productId } = req.body
    const quantity = parseInt(req.body.quantity) || 1
    const buyerId = req.user.userId
    if (!productId) return res.status(400).json({ error: 'productId es obligatorio' })

    const prod = await pool.query(
      `SELECT * FROM products WHERE product_id = $1 AND status = 'active'`, [productId]
    )
    if (!prod.rows.length) return res.status(404).json({ error: 'Producto no encontrado o no disponible' })
    console.log('[orders.createSingle] prod:', prod.rows[0])
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

    await pool.query('UPDATE products SET stock = stock - $1 WHERE product_id = $2', [quantity, productId])
    await pool.query("UPDATE products SET status = 'sold' WHERE product_id = $1 AND stock <= 0", [productId])
    createNotification({ userId: prod.rows[0].seller_id, type: 'purchase', message: 'Tienes una nueva solicitud de compra para tu producto', resourceId: result.rows[0].order_id, resourceType: 'order' })

    return res.status(201).json(result.rows[0])
  } catch (err) {
    console.error('[orders.createSingle] message:', err.message)
    console.error('[orders.createSingle] stack:', err.stack)
    console.error('[orders.createSingle] detail:', err.detail)
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
              1 AS quantity,
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
    console.error('[orders.myOrders]', err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// GET /api/orders/selling — órdenes donde el usuario es el vendedor
exports.mySales = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.order_id, o.status, o.created_at, o.price,
              p.title AS product_title,
              u.name AS buyer_name
       FROM orders o
       JOIN products p ON p.product_id = o.product_id
       JOIN users u ON u.user_id = o.buyer_id
       WHERE o.seller_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.userId]
    )
    return res.status(200).json(result.rows)
  } catch (err) {
    console.error('[orders.mySales]', err)
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
    console.error('[orders.updateStatus]', err)
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
    createNotification({ userId: o.buyer_id, type: 'order_status', message: `Tu orden ha sido actualizada a: ${status}`, resourceId: orderId, resourceType: 'order' })
    return res.status(200).json(result.rows[0])
  } catch (err) {
    console.error('[orders.changeStatus]', err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}
