require('dotenv').config();
const express = require('express');
const cors = require('cors');
const midtransClient = require('midtrans-client');
const app = express();
const PORT = process.env.PORT || 3000;

// Setup CORS
app.use(cors({
  origin: '*', // In production, specify your origin domains
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Midtrans configuration
const snap = new midtransClient.Snap({
  isProduction: false, // Set to true for production
  serverKey: process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-GwUP_WGbJPXsDzsNEBRs8Dja',
  clientKey: process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-W_gnT3Ca7HcpFv9I'
});

// Status endpoint to check if the server is running
app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Create transaction endpoint
app.post('/create-transaction', async (req, res) => {
  try {
    console.log('Creating transaction with data:', JSON.stringify(req.body));
    
    const { order_id, amount, payment_type, customer_details, item_details } = req.body;
    
    if (!order_id || !amount || !payment_type) {
      return res.status(400).json({
        error: true,
        message: 'Missing required parameters: order_id, amount, or payment_type'
      });
    }
    
    // Format the transaction parameters for Midtrans
    const transactionParams = {
      transaction_details: {
        order_id,
        gross_amount: amount
      },
      customer_details: {
        first_name: customer_details?.first_name || 'Customer',
        email: customer_details?.email || 'customer@example.com',
        phone: customer_details?.phone || ''
      },
      item_details: item_details || [{
        id: 'DEFAULT_ITEM',
        name: 'Default Item',
        price: amount,
        quantity: 1
      }]
    };

    // Add custom fields for reference
    if (customer_details?.nickname) {
      transactionParams.custom_field1 = customer_details.nickname;
    }
    if (customer_details?.current_rank) {
      transactionParams.custom_field2 = customer_details.current_rank;
    }
    if (customer_details?.referral_code) {
      transactionParams.custom_field3 = customer_details.referral_code;
    }
    
    // Create the transaction
    const transaction = await snap.createTransaction(transactionParams);
    
    console.log('Transaction created:', transaction);
    
    // Return the token and redirect URL
    res.json({
      token: transaction.token,
      redirect_url: transaction.redirect_url
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to create transaction'
    });
  }
});

// Get transaction by ID
app.get('/transactions/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({
        error: true,
        message: 'Order ID is required'
      });
    }
    
    // Get transaction status from Midtrans API
    const transactionStatus = await snap.createTransactionToken({
      transaction_details: {
        order_id: orderId,
        gross_amount: 1000 // Dummy amount, actual transaction will be retrieved
      }
    });
    
    res.json({
      token: transactionStatus.token,
      order_id: orderId
    });
  } catch (error) {
    console.error('Error getting transaction:', error);
    
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get transaction'
    });
  }
});

// Check transaction status
app.get('/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({
        error: true,
        message: 'Order ID is required'
      });
    }
    
    // Get transaction status from Midtrans API
    const transactionStatus = await snap.transaction.status(orderId);
    
    res.json(transactionStatus);
  } catch (error) {
    console.error('Error checking transaction status:', error);
    
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to check transaction status'
    });
  }
});

// Handle Midtrans notifications
app.post('/notification', async (req, res) => {
  try {
    const notification = await snap.transaction.notification(req.body);
    
    // Process the notification based on your business logic
    console.log('Notification received:', notification);
    
    // For demonstration, just log it
    const transactionStatus = notification.transaction_status;
    const fraudStatus = notification.fraud_status;
    const orderId = notification.order_id;
    
    console.log(`Transaction ID: ${orderId}`);
    console.log(`Transaction status: ${transactionStatus}`);
    console.log(`Fraud status: ${fraudStatus}`);
    
    // Here you would update your database, notify users, etc.
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error processing notification:', error);
    
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to process notification'
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app; // For testing