const express = require('express');
const cors = require('cors');
const midtransClient = require('midtrans-client');
require('dotenv').config(); // load .env

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Ambil dari .env
const serverKey = process.env.MIDTRANS_SERVER_KEY;
const clientKey = process.env.MIDTRANS_CLIENT_KEY;

const snap = new midtransClient.Snap({
  isProduction: false,
  serverKey: serverKey,
  clientKey: clientKey
});

const coreApi = new midtransClient.CoreApi({
  isProduction: false,
  serverKey: serverKey,
  clientKey: clientKey
});

// Buat transaksi Snap
app.post('/create-transaction', async (req, res) => {
  const { order_id, amount, payment_type, customer_details, item_details } = req.body;

  try {
    const parameter = {
      transaction_details: {
        order_id,
        gross_amount: amount
      },
      credit_card: { secure: true },
      customer_details,
      item_details: [item_details],
      enabled_payments: [payment_type.toLowerCase()]
    };

    const transaction = await snap.createTransaction(parameter);
    res.json({
      token: transaction.token,
      redirect_url: transaction.redirect_url
    });
  } catch (err) {
    console.error('Error creating transaction:', err.message);
    res.status(500).json({ error: true, message: err.message });
  }
});

// Retry transaksi
app.post('/retry-transaction', async (req, res) => {
  const { order_id, amount, payment_type } = req.body;

  try {
    const parameter = {
      transaction_details: {
        order_id,
        gross_amount: amount
      },
      enabled_payments: [payment_type.toLowerCase()]
    };

    const transaction = await snap.createTransaction(parameter);
    res.json({
      token: transaction.token,
      redirect_url: transaction.redirect_url
    });
  } catch (err) {
    console.error('Error retrying transaction:', err.message);
    res.status(500).json({ error: true, message: err.message });
  }
});

// Cek status transaksi
app.get("/check-transaction/:order_id", async (req, res) => {
  const { order_id } = req.params;

  try {
    const result = await coreApi.transaction.status(order_id);
    res.json({
      status: result.transaction_status,
      payment_type: result.payment_type,
      order_id: result.order_id,
      gross_amount: result.gross_amount,
      fraud_status: result.fraud_status,
      transaction_time: result.transaction_time,
      token: result.token || null,
      redirect_url: result.redirect_url || null
    });
  } catch (error) {
    console.error("Gagal cek transaksi:", error.message);
    res.status(404).json({ error: true, message: "Transaction not found" });
  }
});

// Tes koneksi
app.get('/', (req, res) => {
  res.send('Midtrans Backend Rank API Aktif');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
