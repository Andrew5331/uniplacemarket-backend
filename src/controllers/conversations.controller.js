const pool = require('../config/db')

// POST /api/conversations — iniciar o recuperar conversación
exports.create = async (req, res) => {
  try {
    const { productId, sellerId } = req.body
    const buyerId = req.user.userId

    if (!productId || !sellerId)
      return res.status(400).json({ error: 'productId y sellerId son obligatorios' })
    if (buyerId === sellerId)
      return res.status(400).json({ error: 'No puedes iniciar una conversación contigo mismo' })

    // Verificar producto existe y está activo
    const prod = await pool.query(
      "SELECT product_id FROM products WHERE product_id = $1 AND status = 'active'", [productId]
    )
    if (!prod.rows.length)
      return res.status(404).json({ error: 'Producto no encontrado o no disponible' })

    // Si ya existe conversación, retornarla
    const existing = await pool.query(
      `SELECT conversation_id FROM conversations
       WHERE product_id = $1 AND buyer_id = $2 AND seller_id = $3`,
      [productId, buyerId, sellerId]
    )
    if (existing.rows.length) {
      return res.status(200).json({
        conversationId: existing.rows[0].conversation_id,
        existing: true
      })
    }

    // Crear nueva conversación
    const result = await pool.query(
      `INSERT INTO conversations (product_id, buyer_id, seller_id)
       VALUES ($1,$2,$3) RETURNING *`,
      [productId, buyerId, sellerId]
    )
    const conv = result.rows[0]
    return res.status(201).json({
      conversationId: conv.conversation_id,
      productId: conv.product_id,
      buyerId: conv.buyer_id,
      sellerId: conv.seller_id,
      createdAt: conv.created_at
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// GET /api/conversations — listar conversaciones del usuario
exports.list = async (req, res) => {
  try {
    const userId = req.user.userId
    const result = await pool.query(
      `SELECT c.conversation_id, c.product_id, c.created_at, c.updated_at,
              p.title AS product_title,
              (SELECT url FROM product_images WHERE product_id = p.product_id ORDER BY position LIMIT 1) AS product_image,
              buyer.user_id AS buyer_id, buyer.name AS buyer_name,
              seller.user_id AS seller_id, seller.name AS seller_name,
              (SELECT content FROM messages WHERE conversation_id = c.conversation_id ORDER BY created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages WHERE conversation_id = c.conversation_id ORDER BY created_at DESC LIMIT 1) AS last_message_at
       FROM conversations c
       JOIN products p ON p.product_id = c.product_id
       JOIN users buyer ON buyer.user_id = c.buyer_id
       JOIN users seller ON seller.user_id = c.seller_id
       WHERE c.buyer_id = $1 OR c.seller_id = $1
       ORDER BY COALESCE(
         (SELECT created_at FROM messages WHERE conversation_id = c.conversation_id ORDER BY created_at DESC LIMIT 1),
         c.created_at
       ) DESC`,
      [userId]
    )
    return res.status(200).json(result.rows.map(c => ({
      conversationId: c.conversation_id,
      productId: c.product_id,
      productTitle: c.product_title,
      productImage: c.product_image ? `http://localhost:4000${c.product_image}` : null,
      otherUser: c.buyer_id === userId
        ? { id: c.seller_id, name: c.seller_name }
        : { id: c.buyer_id, name: c.buyer_name },
      lastMessage: c.last_message,
      lastMessageAt: c.last_message_at,
      updatedAt: c.updated_at
    })))
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// POST /api/conversations/:conversationId/messages — enviar mensaje
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params
    const { content } = req.body
    const senderId = req.user.userId

    if (!content || !content.trim())
      return res.status(400).json({ error: 'El mensaje no puede estar vacío' })
    if (content.length > 1000)
      return res.status(400).json({ error: 'El mensaje no puede superar 1000 caracteres' })

    // Verificar participante
    const conv = await pool.query(
      'SELECT * FROM conversations WHERE conversation_id = $1', [conversationId]
    )
    if (!conv.rows.length) return res.status(404).json({ error: 'Conversación no encontrada' })
    const c = conv.rows[0]
    if (c.buyer_id !== senderId && c.seller_id !== senderId)
      return res.status(403).json({ error: 'No eres participante de esta conversación' })

    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content)
       VALUES ($1,$2,$3) RETURNING *`,
      [conversationId, senderId, content.trim()]
    )
    const msg = result.rows[0]

    // Actualizar updated_at de la conversación
    await pool.query('UPDATE conversations SET updated_at = NOW() WHERE conversation_id = $1', [conversationId])

    // Emitir por Socket.io al room de la conversación
    const io = req.app.get('io')
    if (io) {
      io.to(conversationId).emit('new_message', {
        messageId: msg.message_id,
        conversationId: msg.conversation_id,
        senderId: msg.sender_id,
        content: msg.content,
        createdAt: msg.created_at
      })
    }

    return res.status(201).json({
      messageId: msg.message_id,
      conversationId: msg.conversation_id,
      senderId: msg.sender_id,
      content: msg.content,
      createdAt: msg.created_at
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// GET /api/conversations/:conversationId/messages — historial
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params
    const { page = 1 } = req.query
    const limit = 20
    const offset = (parseInt(page) - 1) * limit
    const userId = req.user.userId

    const conv = await pool.query('SELECT * FROM conversations WHERE conversation_id = $1', [conversationId])
    if (!conv.rows.length) return res.status(404).json({ error: 'Conversación no encontrada' })
    const c = conv.rows[0]
    if (c.buyer_id !== userId && c.seller_id !== userId)
      return res.status(403).json({ error: 'No eres participante de esta conversación' })

    const result = await pool.query(
      `SELECT m.message_id, m.sender_id, m.content, m.created_at, u.name AS sender_name
       FROM messages m JOIN users u ON u.user_id = m.sender_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    )
    return res.status(200).json(result.rows)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}
