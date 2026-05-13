require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Store upload in memory (no disk needed)
const upload = multer({ storage: multer.memoryStorage() });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Route 1: parse screenshot ──────────────────────────────
app.post('/parse-screenshot', upload.single('image'), async (req, res) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const imagePart = {
      inlineData: {
        data: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype,
      },
    };

    const result = await model.generateContent([
      'This is an Apple Maps or Google Maps screenshot. Return ONLY the restaurant or place name, nothing else. No punctuation, no explanation.',
      imagePart,
    ]);

    const name = result.response.text().trim();
    console.log('Gemini extracted name:', name);
    res.json({ name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to parse screenshot' });
  }
});

// ── Route 2: look up place details ────────────────────────
app.get('/place-details', async (req, res) => {
  try {
    const { name } = req.query;

    // First, search for the place
    const searchRes = await axios.get(
      'https://maps.googleapis.com/maps/api/place/findplacefromtext/json',
      {
        params: {
          input: name,
          inputtype: 'textquery',
          fields: 'place_id,name,formatted_address',
          key: process.env.GOOGLE_PLACES_API_KEY,
        },
      }
    );

    const place = searchRes.data.candidates[0];
    if (!place) return res.status(404).json({ error: 'Place not found' });

    // Then, get full details using place_id
    const detailsRes = await axios.get(
      'https://maps.googleapis.com/maps/api/place/details/json',
      {
        params: {
          place_id: place.place_id,
          fields: 'name,formatted_address,opening_hours,price_level,rating,types,website,formatted_phone_number',
          key: process.env.GOOGLE_PLACES_API_KEY,
        },
      }
    );

    res.json(detailsRes.data.result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch place details' });
  }
});

// ── Route 3: autocomplete ──────────────────────────────────
app.get('/autocomplete', async (req, res) => {
  try {
    const { input } = req.query;
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/place/autocomplete/json',
      {
        params: {
          input,
          types: 'restaurant|food|cafe|bar',
          key: process.env.GOOGLE_PLACES_API_KEY,
        },
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Autocomplete failed' });
  }
});

// ── Route 4: place details by ID ───────────────────────────
app.get('/place-details-by-id', async (req, res) => {
  try {
    const { place_id } = req.query;
    const detailsRes = await axios.get(
      'https://maps.googleapis.com/maps/api/place/details/json',
      {
        params: {
          place_id,
          fields: 'name,formatted_address,opening_hours,price_level,rating,types,website,formatted_phone_number',
          key: process.env.GOOGLE_PLACES_API_KEY,
        },
      }
    );
    res.json(detailsRes.data.result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch place details' });
  }
});

// ── Start server ───────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));