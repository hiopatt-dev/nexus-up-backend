const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const STATICGRAM_API = `https://api.staticgram.top/bot${BOT_TOKEN}`;

// Подключение к MongoDB
mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB connected!"))
    .catch(err => console.error("MongoDB error:", err));

// Схема пользователя в базе данных
const userSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    balance: { type: Number, default: 1000 },
});

const User = mongoose.model('User', userSchema);

// Проверка работы сервера
app.get('/', (req, res) => {
    res.send('Nexus Up Backend (StaticGram) is running!');
});

// Получить баланс пользователя
app.get('/api/balance/:telegramId', async (req, res) => {
    try {
        const { telegramId } = req.params;
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, balance: 1000 });
            await user.save();
        }
        res.json({ success: true, balance: user.balance });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Создание счета и отправка прямо в чат игроку
app.post('/api/create-invoice', async (req, res) => {
    try {
        const { telegramId, amount } = req.body;
        if (!telegramId || !amount || amount <= 0) {
            return res.status(400).json({ success: false, error: "Invalid data" });
        }

        const invoiceRes = await axios.post(`${STATICGRAM_API}/createInvoiceLink`, {
            title: "Пополнение баланса Nexus",
            description: `Пополнение на ${amount} ⭐`,
            payload: `deposit_${telegramId}_${amount}_${Date.now()}`,
            currency: "XTR",
            prices: [{ label: "Звёзды", amount: Number(amount) }]
        });

        if (!invoiceRes.data || !invoiceRes.data.result) {
            return res.status(400).json({ success: false, error: "Failed to create invoice link" });
        }

        const invoiceLink = invoiceRes.data.result;

        await axios.post(`${STATICGRAM_API}/sendMessage`, {
            chat_id: telegramId,
            text: `⭐ **Счет на пополнение баланса**\n\nСумма: **${amount}** ⭐\n\nНажми на кнопку ниже, чтобы оплатить счет:`,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: `💳 Оплатить ${amount} ⭐`, url: invoiceLink }]
                ]
            }
        });

        res.json({ success: true, message: "Invoice sent to chat!" });
    } catch (err) {
        console.error("Invoice error:", err.response?.data || err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Вывод средств (Withdraw) с уведомлением в чат Telegram
app.post('/api/withdraw', async (req, res) => {
    try {
        const { telegramId, amount } = req.body;

        if (!telegramId || !amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Некорректная сумма для вывода' });
        }

        let user = await User.findOne({ telegramId });

        if (!user || user.balance < amount) {
            return res.status(400).json({ success: false, error: 'Недостаточно средств на балансе' });
        }

        // Сразу списываем баланс, чтобы избежать повторных запросов
        user.balance -= Number(amount);
        await user.save();

        if (BOT_TOKEN && ADMIN_CHAT_ID) {
            const message = `🔔 **Новая заявка на вывод!**\n\nИгровой ID: \`${telegramId}\`\n💰 Сумма: **${amount}** ⭐\n⭐ Остаток: **${user.balance}**`;
            await axios.post(`${STATICGRAM_API}/sendMessage`, {
                chat_id: ADMIN_CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            }).catch(e => console.error("Admin notify error:", e.message));
        }

        res.json({ success: true, newBalance: user.balance, message: 'Заявка успешно отправлена администратору!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
