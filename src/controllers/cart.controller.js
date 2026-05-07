const pool = require('../config/db')

// GET /api/cart
exports.getCart = async (req, res) => {
  try {
    const userId = req.user.userId
    const result = await pool.query(
      `SELECT ci.cart_item_id, ci.product_id, ci.added_at,
              p.title, p.price, p.status AS product_status,
              u.user_id AS seller_id, u.name AS seller_name,
              (SELECT url FROM product_images WHERE product_id = p.product_id ORDER BY position LIMIT 1) AS image_url
       FROM cart_items ci
       JOIN carts c ON c.cart_id = ci.cart_id
       JOIN products p ON p.product_id = ci.product_id
       JOIN users u ON u.user_id = p.seller_id
       WHERE c.user_id = $1
       ORDER BY ci.added_at DESC`,
      [userId]
    )
    return res.status(200).json(result.rows)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// POST /api/cart/items
exports.addItem = async (req, res) => {
  try {
    const { productId } = req.body
    const userId = req.user.userId
    if (!productId) return res.status(400).json({ error: 'productId es obligatorio' })

    const prod = await pool.query(
      `SELECT * FROM products WHERE product_id = $1 AND status = 'active'`, [productId]
    )
    if (!prod.rows.length) return res.status(404).json({ error: 'Producto no encontrado o no disponible' })
    if (prod.rows[0].seller_id === userId)
      return res.status(400).json({ error: 'No puedes agregar tu propio producto al carrito' })

    // Obtener o crear el carrito del usuario
    const cartRes = await pool.query(
      `INSERT INTO carts (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING cart_id`,
      [userId]
    )
    const cartId = cartRes.rows[0].cart_id

    const existing = await pool.query(
      `SELECT cart_item_id FROM cart_items WHERE cart_id = $1 AND product_id = $2`,
      [cartId, productId]
    )
    if (existing.rows.length) return res.status(400).json({ error: 'El producto ya está en tu carrito' })

    const result = await pool.query(
      `INSERT INTO cart_items (cart_id, product_id) VALUES ($1,$2) RETURNING *`,
      [cartId, productId]
    )
    return res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// DELETE /api/cart/items/:productId
exports.removeItem = async (req, res) => {
  try {
    const { productId } = req.params
    const userId = req.user.userId

    const result = await pool.query(
      `DELETE FROM cart_items
       WHERE cart_id = (SELECT cart_id FROM carts WHERE user_id = $1)
         AND product_id = $2
       RETURNING *`,
      [userId, productId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Producto no encontrado en el carrito' })
    return res.status(200).json({ message: 'Producto eliminado del carrito' })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}
