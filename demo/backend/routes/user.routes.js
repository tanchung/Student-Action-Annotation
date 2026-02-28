const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');

router.get('/', userController.getUsers);
router.get('/:id', userController.getUserById); // <-- API Xem chi tiết
router.put('/:id', userController.updateUser);  // <-- API Cập nhật (Sửa)
router.delete('/:id', userController.deleteUser);
router.post('/create', userController.createUser);

module.exports = router;