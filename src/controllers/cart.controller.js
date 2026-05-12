const pool = require('../config/db')

// Helper: returns cart data for a given userId without sending HTTP response
async function getCartData(userId) {
  await pool.query(
    'INSERT INTO carts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
    [userId]
  )

  const result = await pool.query(
    `SELECT c.cart_id, ci.cart_item_id, ci.product_id, ci.quantity, ci.created_at,
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
      quantity:   r.quantity,
      imageUrl:   r.image_url
        ? (r.image_url.startsWith('data:') || r.image_url.startsWith('http')
            ? r.image_url
            : `${process.env.RENDER_EXTERNAL_URL || 'http://localhost:4000'}${r.image_url}`)
        : null,
      sellerName: r.seller_name,
      sellerId:   r.seller_id,
    }))
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  return { cartId, items, subtotal }
}

exports.getCartData = getCartData

// GET /api/cart
exports.getCart = async (req, res) => {
  try {
    const data = await getCartData(req.user.userId)
    return res.status(200).json(data)
  } catch (err) {
    console.error('[cart.getCart]', err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// POST /api/cart/items
exports.addItem = async (req, res) => {
  try {
    console.log('[cart.addItem] body:', req.body)
    const productId = req.body.productId || req.body.product_id
    const quantity = parseInt(req.body.quantity) || 1
    const userId = req.user.userId
    if (!productId) return res.status(400).json({ error: 'productId es obligatorio' })

    // 1. Get current stock (also validates product exists and is active)
    const prodResult = await pool.query(
      `SELECT stock, seller_id FROM products WHERE product_id = $1 AND status = 'active'`,
      [productId]
    )
    if (!prodResult.rows.length) return res.status(404).json({ error: 'Producto no encontrado o no disponible' })
    const { stock, seller_id } = prodResult.rows[0]
    if (seller_id === userId)
      return res.status(400).json({ error: 'No puedes agregar tu propio producto al carrito' })

    // Get or create cart
    const cartRes = await pool.query(
      `INSERT INTO carts (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING cart_id`,
      [userId]
    )
    const cartId = cartRes.rows[0].cart_id

    // 2. Check current quantity in cart for this product
    const existing = await pool.query(
      `SELECT quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2`,
      [cartId, productId]
    )

    if (existing.rows.length) {
      // 3. Product already in cart — update quantity
      const currentQty = existing.rows[0].quantity
      const newTotal = currentQty + quantity
      if (newTotal > stock) {
        return res.status(400).json({
          error: `No hay suficiente stock. Stock disponible: ${stock}, ya tienes ${currentQty} en tu carrito`
        })
      }
      const result = await pool.query(
        `UPDATE cart_items SET quantity = quantity + $1 WHERE cart_id = $2 AND product_id = $3 RETURNING *`,
        [quantity, cartId, productId]
      )
      return res.status(200).json(result.rows[0])
    } else {
      // 4. Product not in cart — insert
      if (quantity > stock) {
        return res.status(400).json({
          error: `No hay suficiente stock. Stock disponible: ${stock}`
        })
      }
      const result = await pool.query(
        `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3) RETURNING *`,
        [cartId, productId, quantity]
      )
      return res.status(201).json(result.rows[0])
    }
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
