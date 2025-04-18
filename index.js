const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const app = express();
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
    if (snapshot.empty) {
      console.log('No matching documents.');
      return res.status(404).send('Not found');
    }

    snapshot.forEach(async doc => {
      if (transactionStatus === 'settlement' || transactionStatus === 'capture') {
        await doc.ref.update({ status: 'Lunas' });
      } else if (transactionStatus === 'expire') {
        await doc.ref.update({ status: 'Kadaluarsa' });
      } else {
        await doc.ref.update({ status: transactionStatus });
      }
    });

    res.status(200).send('OK');
  } catch (e) {
    res.status(500).send('Error updating Firestore');
  }
});

app.get('/', (req, res) => {
  res.send('Midtrans Webhook is running securely!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));