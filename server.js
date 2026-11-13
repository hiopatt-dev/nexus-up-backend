const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors());

const MONGO_URI = process.env.MONGO_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB error:', err));

const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    balance: { type: Number, default: 1000 }
});
const User = mongoose.model('User', UserSchema);

const WithdrawalSchema = new mongoose.Schema({
    telegramId: String,
    amount: Number,
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});
const Withdrawal = mongoose.model('Withdrawal', WithdrawalSchema);

app.get('/', (req, res) => {
    res.send('NexusUp Backend is running successfully!');
});

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

app.post('/api/upgrade', async (req, res) => {
    try {
        const { telegramId, amount, multiplier, winChance } = req.body;

        let user = await User.findOne({ telegramId });
        if (!user || user.balance < amount) {
            return res.json({ success: false, error: 'Not enough balance' });
        }

        const randomRoll = Math.random() * 100;
        const isWin = randomRoll < winChance;

        let payout = 0;
        if (isWin) {
            payout = Math.floor(amount * multiplier);
            user.balance += (payout - amount);
        } else {
            user.balance -= amount;
        }

        await user.save();
        res.json({ success: true, win: isWin, newBalance: user.balance, payout });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/create-invoice', async (req, res) => {
    try {
        const { telegramId, amount } = req.body;

        // Исправлено: используем стандартный метод Telegram Bot API createInvoiceLink для звёзд (XTR)
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
            title: 'NexusUp Balance Top Up',
            description: `Add ${amount} Telegram Stars`,
            payload: `deposit_${telegramId}_${Date.now()}`,
            currency: 'XTR',
            prices: [{ label: 'Stars', amount: parseInt(amount) }]
        });

        if (response.data && response.data.result) {
            res.json({ success: true, data: { invoice_url: response.data.result } });
        } else {
            res.json({ success: false, error: 'Failed to create invoice' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.response?.data || err.message });
    }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        const { telegramId, amount } = req.body;
        if (amount < 1) return res.json({ success: false, error: 'Invalid amount' });

        let user = await User.findOne({ telegramId });
        if (!user || user.balance < amount) {
            return res.json({ success: false, error: 'Insufficient funds' });
        }

        user.balance -= amount;
        await user.save();

        await Withdrawal.create({ telegramId, amount, status: 'pending' });

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_ID,
            text: `New withdrawal request:\nUser: ${telegramId}\nAmount: ${amount} stars.`,
            parse_mode: 'Markdown'
        }).catch(() => {});

        res.json({ success: true, newBalance: user.balance });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
