const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Midtrans configuration - using environment variables only
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const MIDTRANS_API_URL = process.env.MIDTRANS_API_URL || 'https://api.sandbox.midtrans.com';
const MIDTRANS_SNAP_URL = process.env.MIDTRANS_SNAP_URL || 'https://app.sandbox.midtrans.com/snap/v1/transactions';

// Exit if no server key is provided
if (!MIDTRANS_SERVER_KEY) {
  console.error('ERROR: MIDTRANS_SERVER_KEY environment variable is required');
  process.exit(1);
}

// Helper for Midtrans authorization
const getMidtransAuth = () => {
  return 'Basic ' + Buffer.from(MIDTRANS_SERVER_KEY + ':').toString('base64');
};

// Basic status endpoint to check if server is running
app.get('/status', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create transaction in Midtrans
app.post('/create-transaction', async (req, res) => {
  try {
    const { order_id, amount, payment_type, customer_details, item_details } = req.body;

    if (!order_id || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('Creating transaction:', { order_id, amount, payment_type });

    // Prepare transaction data for Midtrans
    const transactionData = {
      transaction_details: {
        order_id,
        gross_amount: amount
      },
      customer_details: {
        first_name: customer_details?.first_name || 'Customer',
        email: customer_details?.email || `${order_id}@example.com`
      },
      item_details: item_details || [
        {
          id: 'minecraft_rank',
          name: 'Minecraft Rank',
          price: amount,
          quantity: 1
        }
      ]
    };

    console.log('Transaction data:', JSON.stringify(transactionData));

    // Send request to Midtrans API
    const response = await axios.post(MIDTRANS_SNAP_URL, transactionData, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': getMidtransAuth()
      }
    });

    console.log('Midtrans response:', response.data);

    // Return Midtrans response to client
    return res.status(200).json({
      token: response.data.token,
      redirect_url: response.data.redirect_url
    });
  } catch (error) {
    console.error('Error creating transaction:', error.message);
    console.error(error.response?.data || error);
    
    return res.status(500).json({
      error: 'Failed to create transaction',
      message: error.message,
      details: error.response?.data || {}
    });
  }
});

// Get transaction by ID
app.get('/transactions/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    console.log('Getting transaction status for:', orderId);

    const response = await axios.get(`${MIDTRANS_API_URL}/v2/${orderId}/status`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': getMidtransAuth()
      }
    });

    return res.status(200).json({
      order_id: response.data.order_id,
      status: response.data.transaction_status,
      transaction_time: response.data.transaction_time,
      payment_type: response.data.payment_type,
      gross_amount: response.data.gross_amount,
      ...response.data
    });
  } catch (error) {
    console.error('Error getting transaction status:', error.message);
    console.error(error.response?.data || error);

    return res.status(500).json({
      error: 'Failed to get transaction status',
      message: error.message,
      details: error.response?.data || {}
    });
  }
});


// Check transaction status
app.get('/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    console.log('Checking status for order:', orderId);

    // Get transaction status from Midtrans
    const response = await axios.get(`${MIDTRANS_API_URL}/v2/${orderId}/status`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': getMidtransAuth()
      }
    });

    console.log('Status response:', response.data);

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Error checking status:', error.message);
    console.error(error.response?.data || error);
    
    return res.status(500).json({
      error: 'Failed to check transaction status',
      message: error.message,
      details: error.response?.data || {}
    });
  }
});

// Handle Midtrans notifications
app.post('/notification', async (req, res) => {
  try {
    const notification = req.body;

    console.log('Received notification:', notification);

    // Verify transaction status with Midtrans to prevent fraud
    const orderId = notification.order_id;
    const response = await axios.get(`${MIDTRANS_API_URL}/v2/${orderId}/status`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': getMidtransAuth()
      }
    });

    console.log('Verified status:', response.data);

    // Process the notification based on transaction status
    // Here you would update your database, trigger game server, etc.

    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Error processing notification:', error.message);
    console.error(error.response?.data || error);
    
    return res.status(500).json({
      error: 'Failed to process notification',
      message: error.message
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app; // For testing purposes