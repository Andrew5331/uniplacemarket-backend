const pool = require('../config/db')

// GET /api/cart
exports.getCart = async (req, res) => {
  try {
    const userId = req.user.userId

    // Garantizar que el carrito exista antes de consultarlo
    await pool.query(
      'INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [userId]
    )

    const result = await pool.query(
      `SELECT c.cart_id, ci.cart_item_id, ci.product_id, ci.created_at,
              p.title, p.price, p.status AS product_status,
              u.user_id AS seller_id, u.name AS seller_name,
              (SELECT url FROM product_images WHERE product_id = p.product_id ORDER BY position LIMIT 1) AS image_url
       FROM carts c
       LEFT JOIN cart_items ci ON ci.cart_id = c.cart_id
       LEFT JOIN products p ON p.product_id = ci.product_id
       LEFT JOIN users u ON u.user_id = p.seller_id
       WHERE c.user_id = $1
       ORDER BY ci.created_at DESC`,
      [userId]
    )

    const cartId = result.rows[0]?.cart_id ?? null
    const items = result.rows
      .filter(r => r.product_id !== null)
      .map(r => ({
        productId:  r.product_id,
        title:      r.title,
        price:      parseFloat(r.price),
        quantity:   1,
        imageUrl:   r.image_url
          ? (r.image_url.startsWith('data:') || r.image_url.startsWith('http')
              ? r.image_url
              : `${process.env.RENDER_EXTERNAL_URL || 'http://localhost:4000'}${r.image_url}`)
          : null,
        sellerName: r.seller_name,
        sellerId:   r.seller_id,
      }))
    const subtotal = items.reduce((sum, i) => sum + i.price, 0)

    return res.status(200).json({ cartId, items, subtotal })
  } catch (err) {
    console.error('[cart.getCart]', err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// POST /api/cart/items
exports.addItem = async (req, res) => {
  try {
    console.log('[cart.addItem] body:', req.body)
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
    console.error('[cart.addItem]', err)
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
    console.error('[cart.removeItem]', err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}
