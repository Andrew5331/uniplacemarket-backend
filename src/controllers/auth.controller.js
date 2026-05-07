const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const pool = require('../config/db')

const EMAIL_REGEX = /^[^\s@]+@unisabana\.edu\.co$/
const PASS_REGEX = /^(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body
    const details = []

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Datos inválidos', details: ['Nombre, correo y contraseña son obligatorios'] })
    }
    if (!EMAIL_REGEX.test(email)) details.push('El correo debe ser institucional (@unisabana.edu.co)')
    if (!PASS_REGEX.test(password)) details.push('La contraseña debe tener mínimo 8 caracteres, 1 número y 1 carácter especial')
    if (details.length) return res.status(400).json({ error: 'Datos inválidos', details })

    // Verificar si ya existe
    const exists = await pool.query('SELECT user_id FROM users WHERE email = $1', [email])
    if (exists.rows.length) return res.status(409).json({ error: 'El correo ya está registrado' })

    const hash = await bcrypt.hash(password, 10)
    const result = await pool.query(
      `INSERT INTO users (name, email, password) VALUES ($1, $2, $3)
       RETURNING user_id, name, email, is_seller, reputation`,
      [name.trim(), email.toLowerCase(), hash]
    )
    const user = result.rows[0]
    const token = jwt.sign(
      { userId: user.user_id, email: user.email, isSeller: user.is_seller },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )
    return res.status(201).json({ token, user: { userId: user.user_id, name: user.name, email: user.email, isSeller: user.is_seller, reputation: user.reputation } })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son requeridos' })

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1', [email.toLowerCase()]
    )
    if (!result.rows.length) return res.status(401).json({ error: 'Credenciales incorrectas' })

    const user = result.rows[0]
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' })

    const token = jwt.sign(
      { userId: user.user_id, email: user.email, isSeller: user.is_seller },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )
    return res.status(200).json({
      token,
      user: { userId: user.user_id, name: user.name, email: user.email, career: user.career, photoUrl: user.photo_url, isSeller: user.is_seller, reputation: parseFloat(user.reputation) }
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}

// POST /api/auth/logout  (el FE elimina el token; aquí solo confirmamos)
exports.logout = (req, res) => {
  return res.status(200).json({ message: 'Sesión cerrada exitosamente' })
}

// GET /api/auth/me — verifica rol actual desde BD
exports.me = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT user_id, name, email, career, photo_url, is_seller, reputation FROM users WHERE user_id = $1',
      [req.user.userId]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' })
    const u = result.rows[0]
    return res.status(200).json({ userId: u.user_id, name: u.name, email: u.email, career: u.career, photoUrl: u.photo_url, isSeller: u.is_seller, reputation: parseFloat(u.reputation) })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Error del servidor' })
  }
}
