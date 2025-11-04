import { Request, Response } from 'express';
import axios from 'axios';
import { supabaseAdmin } from '../utils/supabaseClient';

export class PaymentController {
  // Initialize Paystack transaction (from backend as per Paystack best practices)
  async initializeTransaction(req: Request, res: Response) {
    try {
      const { email, amount, reference, callback_url, metadata } = req.body;

      // Validate required fields
      if (!email || !amount || !reference) {
        return res.status(400).json({
          success: false,
          message: 'Email, amount, and reference are required',
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format',
        });
      }

      const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
      if (!paystackSecretKey) {
        return res.status(500).json({
          success: false,
          message: 'Paystack secret key not configured',
        });
      }

      // Prepare Paystack initialize transaction payload
      const payload: any = {
        email,
        amount: Math.round(amount), // Amount in pesewas (GHS * 100)
        reference,
        currency: 'GHS',
      };

      // Add callback URL if provided
      if (callback_url) {
        payload.callback_url = callback_url;
      }

      // Add metadata if provided
      if (metadata) {
        payload.metadata = metadata;
      }

      // Initialize transaction with Paystack
      const response = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        payload,
        {
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.status) {
        return res.json({
          success: true,
          data: response.data.data,
          message: 'Transaction initialized successfully',
        });
      } else {
        return res.status(400).json({
          success: false,
          message: response.data.message || 'Failed to initialize transaction',
        });
      }
    } catch (error: any) {
      console.error('Error initializing Paystack transaction:', error);
      return res.status(500).json({
        success: false,
        message: error.response?.data?.message || 'Failed to initialize transaction',
        error: error.message,
      });
    }
  }

  // Verify Paystack transaction
  async verifyTransaction(req: Request, res: Response) {
    try {
      const { reference } = req.body;

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: 'Transaction reference is required',
        });
      }

      const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
      if (!paystackSecretKey) {
        return res.status(500).json({
          success: false,
          message: 'Paystack secret key not configured',
        });
      }

      // Verify transaction with Paystack
      const response = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${paystackSecretKey}`,
          },
        }
      );

      if (response.data.status) {
        const transaction = response.data.data;

        // Verify transaction status and amount
        const isSuccessful = transaction.status === 'success';
        const verifiedAmount = transaction.amount;

        // Save transaction to database for tracking
        try {
          const transactionData: any = {
            transaction_reference: reference,
            paystack_reference: transaction.reference,
            payment_method: transaction.metadata?.payment_method || 'paystack',
            payment_provider: 'paystack',
            amount: verifiedAmount / 100, // Convert from pesewas to GHS
            currency: transaction.currency || 'GHS',
            status: isSuccessful ? 'success' : 'failed',
            payment_status: isSuccessful ? 'paid' : 'failed',
            customer_email: transaction.customer?.email || transaction.metadata?.customer_email || '',
            customer_code: transaction.customer?.customer_code || null,
            authorization_code: transaction.authorization?.authorization_code || null,
            channel: transaction.channel || null,
            metadata: transaction.metadata || {},
            initiated_at: transaction.created_at ? new Date(transaction.created_at).toISOString() : new Date().toISOString(),
          };

          // Add paid_at timestamp if successful
          if (isSuccessful && transaction.paid_at) {
            transactionData.paid_at = new Date(transaction.paid_at).toISOString();
          }

          // Add user_id if available in metadata
          if (transaction.metadata?.user_id && transaction.metadata.user_id !== 'guest') {
            transactionData.user_id = transaction.metadata.user_id;
          }

          // Try to find associated order by payment reference or order_id in metadata
          if (transaction.metadata?.order_id) {
            // Direct order_id from metadata
            const { data: orderData } = await supabaseAdmin
              .from('orders')
              .select('id, user_id, order_number')
              .eq('id', transaction.metadata.order_id)
              .maybeSingle();
            
            if (orderData) {
              transactionData.order_id = orderData.id;
              if (!transactionData.user_id && orderData.user_id) {
                transactionData.user_id = orderData.user_id;
              }
            }
          } else if (transaction.metadata?.payment_reference) {
            // Try to find order by payment_reference (which might be order_number)
            const { data: orderData } = await supabaseAdmin
              .from('orders')
              .select('id, user_id, order_number, payment_reference')
              .eq('payment_reference', transaction.metadata.payment_reference)
              .or(`order_number.eq.${transaction.metadata.payment_reference}`)
              .maybeSingle();
            
            if (orderData) {
              transactionData.order_id = orderData.id;
              if (!transactionData.user_id && orderData.user_id) {
                transactionData.user_id = orderData.user_id;
              }
            }
          }

          // Insert or update transaction
          const { error: dbError } = await supabaseAdmin
            .from('transactions')
            .upsert(transactionData, {
              onConflict: 'transaction_reference',
              ignoreDuplicates: false,
            });

          if (dbError) {
            console.error('Error saving transaction to database:', dbError);
            // Don't fail the request if DB save fails
          }
        } catch (dbError) {
          console.error('Error saving transaction:', dbError);
          // Don't fail the request if DB save fails
        }

        return res.json({
          success: isSuccessful,
          data: {
            reference: transaction.reference,
            status: transaction.status,
            amount: verifiedAmount,
            currency: transaction.currency,
            customer: transaction.customer,
            metadata: transaction.metadata,
            paid_at: transaction.paid_at,
            created_at: transaction.created_at,
          },
          message: isSuccessful ? 'Transaction verified successfully' : 'Transaction verification failed',
        });
      } else {
        return res.status(400).json({
          success: false,
          message: response.data.message || 'Transaction verification failed',
        });
      }
    } catch (error: any) {
      console.error('Error verifying Paystack transaction:', error);
      return res.status(500).json({
        success: false,
        message: error.response?.data?.message || 'Failed to verify transaction',
        error: error.message,
      });
    }
  }

  // Update transaction with order_id after order is created
  async updateOrderLink(req: Request, res: Response) {
    try {
      const { transaction_reference, order_id } = req.body;

      if (!transaction_reference || !order_id) {
        return res.status(400).json({
          success: false,
          message: 'Transaction reference and order ID are required',
        });
      }

      // Update transaction with order_id
      const { error: updateError } = await supabaseAdmin
        .from('transactions')
        .update({
          order_id,
          updated_at: new Date().toISOString(),
        })
        .eq('transaction_reference', transaction_reference);

      if (updateError) {
        return res.status(500).json({
          success: false,
          message: 'Failed to update transaction-order link',
          error: updateError.message,
        });
      }

      return res.json({
        success: true,
        message: 'Transaction linked to order successfully',
      });
    } catch (error: any) {
      console.error('Error updating transaction-order link:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update transaction-order link',
        error: error.message,
      });
    }
  }
}

