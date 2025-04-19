// Import required packages
const express = require('express');
const cors = require('cors');
const midtransClient = require('midtrans-client');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Validate environment variables
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const MIDTRANS_CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (!MIDTRANS_SERVER_KEY || !MIDTRANS_CLIENT_KEY) {
  console.error('Missing Midtrans API keys in environment variables');
  process.exit(1);
}

// Create Midtrans Snap API instance
const snap = new midtransClient.Snap({
  isProduction: IS_PRODUCTION,
  serverKey: MIDTRANS_SERVER_KEY,
  clientKey: MIDTRANS_CLIENT_KEY
});

// Routes
app.get('/', (req, res) => {
  res.send('Kuycountry Midtrans Backend Service');
});

// Health check endpoint
app.get('/status', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Create Midtrans transaction
app.post('/create-transaction', async (req, res) => {
  try {
    const { order_id, amount, payment_type, customer_details, item_details } = req.body;
    
    if (!order_id || !amount) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Log the request for debugging
    console.log('Create transaction request:', req.body);
    
    // Prepare transaction parameters
    const transactionParams = {
      transaction_details: {
        order_id: order_id,
        gross_amount: parseInt(amount)
      },
      credit_card: {
        secure: true
      },
      customer_details: {
        first_name: customer_details.nickname,
        email: `${customer_details.nickname.toLowerCase()}@example.com`, // Use placeholder email
        phone: '081234567890' // Use placeholder phone
      },
      item_details: [{
        id: item_details.id,
        price: parseInt(item_details.price),
        quantity: item_details.quantity,
        name: item_details.name
      }],
      custom_field1: customer_details.current_rank || '',
      custom_field2: customer_details.referral_code || ''
    };
    
    // Create transaction
    const transaction = await snap.createTransaction(transactionParams);
    
    // Log the response for debugging
    console.log('Midtrans response:', transaction);
    
    res.status(200).json({
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

// Retry transaction
app.post('/retry-transaction', async (req, res) => {
  try {
    const { order_id, amount, payment_type } = req.body;
    
    if (!order_id || !amount) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Create a new unique order ID based on the original one
    const new_order_id = `${order_id}_RETRY_${Date.now().toString().substring(8, 13)}`;
    
    // Prepare transaction parameters
    const transactionParams = {
      transaction_details: {
        order_id: new_order_id,
        gross_amount: parseInt(amount)
      },
      credit_card: {
        secure: true
      }
    };
    
    // Create transaction
    const transaction = await snap.createTransaction(transactionParams);
    
    res.status(200).json({
      token: transaction.token,
      redirect_url: transaction.redirect_url,
      new_order_id: new_order_id
    });
  } catch (error) {
    console.error('Error retrying transaction:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to retry transaction'
    });
  }
});

// Check transaction status
app.get('/check-transaction/:order_id', async (req, res) => {
  try {
    const order_id = req.params.order_id;
    
    if (!order_id) {
      return res.status(400).json({ error: 'Missing order ID' });
    }
    
    // Check transaction status from Midtrans
    const status = await snap.transaction.status(order_id);
    
    // If transaction exists but needs a new token
    if (status && (status.transaction_status === 'pending' || status.transaction_status === 'expire')) {
      // Create a new transaction token for the same order ID
      try {
        const transactionParams = {
          transaction_details: {
            order_id: `${order_id}_REFRESH_${Date.now().toString().substring(8, 13)}`,
            gross_amount: parseInt(status.gross_amount)
          },
          credit_card: {
            secure: true
          }
        };
        
        const newTransaction = await snap.createTransaction(transactionParams);
        
        return res.status(200).json({
          status: status.transaction_status,
          token: newTransaction.token,
          redirect_url: newTransaction.redirect_url,
          transaction_details: status
        });
      } catch (newTokenError) {
        console.error('Error creating new token:', newTokenError);
        return res.status(200).json({
          status: status.transaction_status,
          transaction_details: status
        });
      }
    }
    
    return res.status(200).json({
      status: status.transaction_status,
      transaction_details: status
    });
    
  } catch (error) {
    console.error('Error checking transaction:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to check transaction status'
    });
  }
});

// Webhook handler for notifications from Midtrans
app.post('/webhook', async (req, res) => {
  try {
    const notification = req.body;
    
    // Log the notification for debugging
    console.log('Received webhook notification:', notification);
    
    // Verify the notification signature
    const verificationResult = await snap.transaction.notification(notification);
    
    // Process the notification based on transaction status
    const orderId = verificationResult.order_id;
    const transactionStatus = verificationResult.transaction_status;
    const fraudStatus = verificationResult.fraud_status;
    
    // Sample transaction status handling
    let message = `Transaction notification received. Order ID: ${orderId}. Transaction status: ${transactionStatus}. Fraud status: ${fraudStatus}`;
    
    // Handle transaction status
    if (transactionStatus === 'capture') {
      if (fraudStatus === 'challenge') {
        // TODO: handle transaction with challenge fraud status
        message = `Transaction with order ID: ${orderId} is challenged by FDS`;
      } else if (fraudStatus === 'accept') {
        // TODO: handle successful transaction
        message = `Transaction with order ID: ${orderId} is completed successfully`;
      }
    } else if (transactionStatus === 'settlement') {
      // TODO: handle successful transaction
      message = `Transaction with order ID: ${orderId} has been settled`;
    } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
      // TODO: handle failed transaction
      message = `Transaction with order ID: ${orderId} is ${transactionStatus}`;
    } else if (transactionStatus === 'pending') {
      // TODO: handle pending transaction
      message = `Transaction with order ID: ${orderId} is pending`;
    }
    
    console.log(message);
    
    // Return 200 to acknowledge receipt of notification
    return res.status(200).json({
      status: 'OK',
      message: message
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({
      status: 'ERROR',
      message: error.message
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${IS_PRODUCTION ? 'Production' : 'Development'}`);
});