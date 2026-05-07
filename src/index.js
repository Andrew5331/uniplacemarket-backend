require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const http = require('http')
const fs = require('fs')
const { Server } = require('socket.io')

const app = express()
const server = http.createServer(app)

// Garantizar que el directorio uploads exista (Render usa filesystem efímero)
const uploadsDir = path.join(__dirname, '../uploads')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

const io = new Server(server, {
  cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'] }
})

app.use(cors({ origin: FRONTEND_URL, credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(uploadsDir))

app.set('io', io)

io.on('connection', (socket) => {
  socket.on('join_conversation', (id) => socket.join(id))
  socket.on('leave_conversation', (id) => socket.leave(id))
})

app.use('/api', require('./routes/index'))
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

// Self-ping cada 10 minutos para evitar que Render duerma el servidor
if (process.env.NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL) {
  const https = require('https')
  setInterval(() => {
    const url = `${process.env.RENDER_EXTERNAL_URL}/health`
    https.get(url, (res) => {
      console.log(`🏓 Self-ping OK — ${new Date().toLocaleTimeString()} — status: ${res.statusCode}`)
    }).on('error', (err) => {
      console.error('🏓 Self-ping error:', err.message)
    })
  }, 10 * 60 * 1000)
  console.log('✅ Self-ping activado — backend no se dormirá')
}

// Error handler global — captura errores de multer y otros middlewares
app.use((err, req, res, next) => {
  console.error('❌ Express error handler:', err.message, '\n', err.stack)
  res.status(err.status || 500).json({ error: err.message || 'Error del servidor' })
})

const PORT = process.env.PORT || 4000
server.listen(PORT, () => console.log(`🚀 Backend en http://localhost:${PORT}`))
