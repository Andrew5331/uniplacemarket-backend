const multer = require('multer')
const path = require('path')

// Ruta absoluta para evitar diferencias entre process.cwd() y __dirname en producción
const uploadsDir = path.join(__dirname, '../../uploads')

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname))
  }
})

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png']
  if (allowed.includes(file.mimetype)) cb(null, true)
  else cb(new Error('Solo se permiten archivos JPG o PNG'), false)
}

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }  // 2MB
})
