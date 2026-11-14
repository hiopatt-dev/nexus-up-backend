const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.cors ? cors() : cors());
app.use(express.json());

// Раздача статики для фронтенда мини-приложения
app.use(express.static(path.join(__dirname, 'public')));

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_ID = process.env.ADMIN_ID;

// Подключение к MongoDB
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

// Базовая схема пользователя
const userSchema = new mongoose.Schema({
    telegramId: { type: Number, required: true, unique: true },
    balance: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// Проверка работы сервера
app.get('/api/ping', (req, res) => {
    res.json({ status: 'ok', message: 'Nexus Up backend is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
