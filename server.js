const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors());

// Переменные из настроек Render
const MONGO_URI = process.env.MONGO_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID; // Твой Telegram ID для заявок на вывод

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB подключена'))
    .catch(err => console.error('Ошибка MongoDB:', err));

// Схема пользователя
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    balance: { type: Number, default: 1000 } // Стартовый баланс для тестов
});
const User = mongoose.model('User', UserSchema);

// Схема заявок на вывод
const WithdrawalSchema = new mongoose.Schema({
    telegramId: String,
    amount: Number,
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);

// Получить баланс пользователя
app.get('/api/balance/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = await User.create({ telegramId, balance: 1000 });
        }
        res.json({ success: true, balance: user.balance });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Игровая логика (Рулетка / Апгрейд)
app.post('/api/upgrade', async (req, res) => {
    try {
        const { telegramId, amount, multiplier, winChance } = req.body;
        
        let user = await User.findOne({ telegramId });
        if (!user || user.balance < amount) {
            return res.json({ success: false, error: 'Недостаточно средств' });
        }

        const randomRoll = Math.random() * 100;
        const isWin = randomRoll <= winChance;
        
        let payout = 0;
        if (isWin) {
            payout = Math.floor(amount * multiplier);
            user.balance += (payout - amount); // Чистый выигрыш
        } else {
            user.balance -= amount; // Списание ставки при проигрыше
        }

        await user.save();
        res.json({ success: true, win: isWin, newBalance: user.balance, payout });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Создание счета на пополнение через официальный Telegram Bot API (XTR)
app.post('/api/create-invoice', async (req, res) => {
    try {
        const { telegramId, amount } = req.body;
        
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            title: "Пополнение баланса NexusUp",
            description: `Пополнение счета на ${amount} Telegram Stars`,
            payload: `deposit_${telegramId}_${Date.now()}`,
            currency: "XTR",
            prices: [{ label: "Звезды", amount: parseInt(amount) }]
        });

        if (response.data && response.data.result) {
            res.json({ success: true, data: { invoice_url: response.data.result } });
        } else {
            res.json({ success: false, error: 'Не удалось создать ссылку на оплату' });
        }
    } catch (err) {
        console.log('Ошибка инвойса:', err.response?.data || err.message);
        res.json({ success: false, error: 'Ошибка создания инвойса в Telegram' });
    }
});

// Запрос на вывод (моментальное списание + уведомление админу)
app.post('/api/withdraw', async (req, res) => {
    try {
        const { telegramId, amount } = req.body;

        if (amount < 1) {
            return res.json({ success: false, error: 'Некорректная сумма' });
        }

        let user = await User.findOne({ telegramId });
        if (!user || user.balance < amount) {
            return res.json({ success: false, error: 'Недостаточно звезд на балансе' });
        }

        // Мгновенно списываем баланс
        user.balance -= amount;
        await user.save();

        // Сохраняем заявку
        const withdrawal = await Withdrawal.create({ telegramId, amount, status: 'pending' });

        // Шлем уведомление тебе в личку
        const message = `🔔 **Новая заявка на вывод!**\n\n🆔 Юзер: \`${telegramId}\`\n⭐ Сумма: **${amount} звезд**\n📌 ID заявки: \`${withdrawal._id}\``;
        
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_ID,
            text: message,
            parse_mode: 'Markdown'
        }).catch(e => console.log('Ошибка отправки админу:', e.message));

        res.json({ success: true, newBalance: user.balance });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
