const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const Service = require('../models/Service');
const jwt = require('jsonwebtoken');

// Multer setup for file uploads
const storage = multer.diskStorage({
  
  destination: (req, file, cb) => {
    debugger
    const uploadPath = path.join(__dirname, '../uploads');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

// Get all services
router.get('/', async (req, res) => {
  try {
    const services = await Service.find();
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching services' });
  }
});

// Add a new service with image upload
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { title, pricePerSquareFoot } = req.body;
    const imagePath = req.file ? `/uploads/${req.file.filename}` : '';

    const newService = new Service({
      title,
      pricePerSquareFoot,
      imagePath,
    });

    await newService.save();
    res.status(201).json(newService);
  } catch (err) {
    console.error('Error adding service:', err);
    res.status(500).json({ message: 'Error adding service' });
  }
});

// Update a service with image upload
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { title, pricePerSquareFoot } = req.body;
    const imagePath = req.file ? `/uploads/${req.file.filename}` : req.body.imagePath;

    const updatedService = await Service.findByIdAndUpdate(
      req.params.id,
      { title, pricePerSquareFoot, imagePath },
      { new: true }
    );

    if (!updatedService) {
      return res.status(404).json({ message: 'Service not found' });
    }

    res.json(updatedService);
  } catch (err) {
    console.error('Error updating service:', err);
    res.status(500).json({ message: 'Failed to update service' });
  }
});

// Delete a service
router.delete('/:id', async (req, res) => {
  try {
    const deletedService = await Service.findByIdAndDelete(req.params.id);

    if (!deletedService) {
      return res.status(404).json({ message: 'Service not found' });
    }

    res.json({ message: 'Service deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting service' });
  }
});

module.exports = router;
