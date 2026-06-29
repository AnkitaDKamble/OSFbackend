// routes/yourRoute.js
const express = require('express');
const router = express.Router();

// Sample GET route
router.get('/', (req, res) => {
    res.send('Hello from yourRoute!');
});

module.exports = router;
