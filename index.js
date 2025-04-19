const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

app.post('/webhook', async (req, res) => {
  const notif = req.body;
  const orderId = notif.order_id;
  const transactionStatus = notif.transaction_status;

  try {
    const checkoutRef = db.collection('checkout').where('order_id', '==', orderId);
    const snapshot = await checkoutRef.get();
    if (snapshot.empty) return res.status(404).send('Not found');

    snapshot.forEach(async doc => {
      const statusUpdate = (transactionStatus === 'settlement' || transactionStatus === 'capture') 
        ? 'Lunas' 
        : (transactionStatus === 'expire') ? 'Kadaluarsa' : transactionStatus;
      await doc.ref.update({ status: statusUpdate });
    });

    res.status(200).send('OK');
  } catch (e) {
    res.status(500).send('Error updating Firestore');
  }
});

app.post('/create-transaction', async (req, res) => {
  const { order_id, amount, payment_type, customer_details, item_details } = req.body;

  try {
    const snapResponse = await axios.post('https://app.sandbox.midtrans.com/snap/v1/transactions', {
      transaction_details: {
        order_id: order_id,
        gross_amount: amount
      },
      payment_type: payment_type,
      customer_details: customer_details,
      item_details: [item_details]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(process.env.MIDTRANS_SERVER_KEY + ':').toString('base64')}`
      }
    });

    res.json({ token: snapResponse.data.token });
  } catch (error) {
    console.error('Midtrans error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

app.get('/', (req, res) => {
  res.send('Midtrans backend with Firestore is running!');
});

// FIX: Gunakan PORT dari environment Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
