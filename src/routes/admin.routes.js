const router = require('express').Router()
const auth = require('../middleware/auth')
const admin = require('../middleware/admin')
const adminCtrl = require('../controllers/admin.controller')

router.use(auth, admin)

router.get('/dashboard', adminCtrl.dashboard)
router.get('/users', adminCtrl.listUsers)
router.patch('/users/:userId/suspend', adminCtrl.suspendUser)
router.delete('/users/:userId', adminCtrl.deleteUser)
router.delete('/products/:productId', adminCtrl.deleteProduct)
router.get('/reports', adminCtrl.listReports)
router.patch('/reports/:reportId', adminCtrl.updateReport)

module.exports = router
