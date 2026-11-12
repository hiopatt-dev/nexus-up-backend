const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// Подключение к MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Схема пользователя в базе данных
const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);

// Проверка работы сервера
app.get('/', (req, res) => {
  res.send('StatickGram Backend запущен!');
});

// Получить баланс пользователя
app.get('/api/balance/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    let user = await User.findOne({ telegramId });
    
    if (!user) {
      user = new User({ telegramId, balance: 0 });
      await user.save();
    }
    
    res.json({ success: true, balance: user.balance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Пополнение баланса (Deposit)
app.post('/api/deposit', async (req, res) => {
  try {
    const { telegramId, amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Некорректная сумма пополнения' });
    }

    let user = await User.findOneAndUpdate(
      { telegramId },
      { $inc: { balance: amount } },
      { new: true, upsert: true }
    );

    res.json({ success: true, newBalance: user.balance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Вывод средств (Withdraw) с уведомлением в твой Telegram
app.post('/api/withdraw', async (req, res) => {
  try {
    const { telegramId, amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Некорректная сумма для вывода' });
    }

    let user = await User.findOne({ telegramId });

    if (!user || user.balance < amount) {
      return res.status(400).json({ success: false, error: 'Недостаточно средств на балансе' });
    }

    // Сразу списываем баланс, чтобы избежать повторных запросов
    user.balance -= amount;
    await user.save();

    // Отправляем уведомление тебе в личку через Telegram Bot API
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

    if (BOT_TOKEN && ADMIN_CHAT_ID) {
      const message = `🔔 **Новая заявка на вывод!**\n\n👤 Пользователь ID: \`${telegramId}\`\n💰 Сумма: **${amount} звезд**`;
      
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ADMIN_CHAT_ID,
          text: message,
          parse_mode: 'Markdown'
        })
      });
    }

    res.json({ success: true, newBalance: user.balance, message: 'Заявка успешно отправлена администратору' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
