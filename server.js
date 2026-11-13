// Создание инвойса через методы StaticGram (createGramInvoiceLink / createInvoiceLink)
app.post('/api/create-invoice', async (req, res) => {
    try {
        const { telegramId, amount } = req.body;
        
        // Пробуем метод расширения StaticGram, либо стандартный createInvoiceLink через их прокси/API
        let response;
        try {
            response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createGramInvoiceLink`, {
                title: "Пополнение баланса NexusUp",
                description: `Пополнение счета на ${amount} Telegram Stars`,
                payload: `deposit_${telegramId}_${Date.now()}`,
                currency: "XTR",
                prices: [{ label: "Звезды", amount: parseInt(amount) }]
            });
        } catch (e) {
            // Если специфичный метод StaticGram вернет ошибку, шлем стандартный замолвленный метод
            response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                title: "Пополнение баланса NexusUp",
                description: `Пополнение счета на ${amount} Telegram Stars`,
                payload: `deposit_${telegramId}_${Date.now()}`,
                currency: "XTR",
                prices: [{ label: "Звезды", amount: parseInt(amount) }]
            });
        }

        if (response.data && response.data.result) {
            res.json({ success: true, data: { invoice_url: response.data.result } });
        } else {
            res.json({ success: false, error: 'Не удалось создать ссылку на оплату' });
        }
    } catch (err) {
        console.log('Ошибка инвойса StaticGram:', err.response?.data || err.message);
        res.json({ success: false, error: 'Ошибка создания инвойса' });
    }
});
