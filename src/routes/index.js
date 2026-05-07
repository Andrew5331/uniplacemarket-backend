const router = require('express').Router()
const auth = require('../middleware/auth')
const upload = require('../middleware/upload')

const authCtrl  = require('../controllers/auth.controller')
const usersCtrl = require('../controllers/users.controller')
const prodsCtrl = require('../controllers/products.controller')
const revCtrl   = require('../controllers/reviews.controller')
const ordCtrl   = require('../controllers/orders.controller')
const convCtrl  = require('../controllers/conversations.controller')
const cartCtrl  = require('../controllers/cart.controller')

// Auth
router.post('/auth/register', authCtrl.register)
router.post('/auth/login',    authCtrl.login)
router.post('/auth/logout',   auth, authCtrl.logout)
router.get('/auth/me',        auth, authCtrl.me)

// Users
router.get('/users/:userId',         auth, usersCtrl.getUser)
router.put('/users/:userId',         auth, upload.single('photo'), usersCtrl.updateUser)
router.get('/users/:userId/reviews', revCtrl.getBySeller)   // público

// Categories
router.get('/categories', prodsCtrl.getCategories)

// Products
router.get('/products',               auth, prodsCtrl.list)
router.get('/products/my',            auth, prodsCtrl.myProducts)
router.get('/products/:productId',    auth, prodsCtrl.getOne)
router.post('/products',              auth, upload.array('images', 5), prodsCtrl.create)
router.put('/products/:productId',    auth, upload.array('images', 5), prodsCtrl.update)
router.delete('/products/:productId', auth, prodsCtrl.remove)

// Reviews
router.post('/reviews',                    auth, revCtrl.create)
router.get('/reviews/product/:productId',  auth, revCtrl.getByProduct)
router.patch('/reviews/:reviewId/helpful', auth, revCtrl.markHelpful)

// Cart
router.get('/cart',                    auth, cartCtrl.getCart)
router.post('/cart/items',             auth, cartCtrl.addItem)
router.delete('/cart/items/:productId', auth, cartCtrl.removeItem)

// Orders
router.post('/orders',                    auth, ordCtrl.create)
router.post('/orders/single',             auth, ordCtrl.createSingle)
router.get('/orders/my',                  auth, ordCtrl.myOrders)
router.patch('/orders/:orderId/status',   auth, ordCtrl.changeStatus)
router.patch('/orders/:orderId',          auth, ordCtrl.updateStatus)

// Conversations
router.post('/conversations',                                  auth, convCtrl.create)
router.get('/conversations',                                   auth, convCtrl.list)
router.post('/conversations/:conversationId/messages',         auth, convCtrl.sendMessage)
router.get('/conversations/:conversationId/messages',          auth, convCtrl.getMessages)
router.delete('/conversations/:conversationId',                auth, convCtrl.deleteConversation)

module.exports = router
