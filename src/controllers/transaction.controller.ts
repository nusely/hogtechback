import { Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';

export class TransactionController {
  // Get all transactions (admin)
  async getAllTransactions(req: Request, res: Response) {
    try {
      const { status, user_id, order_id } = req.query;
      
      // Fetch transactions first (without joins to avoid relationship query issues)
      let query = supabaseAdmin
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply filters
      if (status) {
        query = query.eq('payment_status', status as string);
      }

      if (user_id) {
        query = query.eq('user_id', user_id as string);
      }

      if (order_id) {
        query = query.eq('order_id', order_id as string);
      }

      const { data: transactionsData, error: transactionsError } = await query;

      if (transactionsError) {
        throw transactionsError;
      }

      // Fetch orders separately to get order_numbers (avoid relationship query issues)
      const orderIds = [...new Set((transactionsData || [])
        .map((tx: any) => tx.order_id)
        .filter((id: any) => id))] as string[];

      let ordersMap: { [key: string]: any } = {};
      if (orderIds.length > 0) {
        const { data: ordersData } = await supabaseAdmin
          .from('orders')
          .select('id, order_number, status, payment_status')
          .in('id', orderIds);
        
        if (ordersData) {
          ordersMap = ordersData.reduce((acc: any, order: any) => {
            acc[order.id] = order;
            return acc;
          }, {});
        }
      }

      // Fetch users separately
      const userIds = [...new Set((transactionsData || [])
        .map((tx: any) => tx.user_id)
        .filter((id: any) => id))] as string[];

      let usersMap: { [key: string]: any } = {};
      if (userIds.length > 0) {
        const { data: usersData } = await supabaseAdmin
          .from('users')
          .select('id, first_name, last_name, email')
          .in('id', userIds);
        
        if (usersData) {
          usersMap = usersData.reduce((acc: any, user: any) => {
            acc[user.id] = user;
            return acc;
          }, {});
        }
      }

      // Combine transactions with orders and users
      const data = (transactionsData || []).map((tx: any) => ({
        ...tx,
        order: tx.order_id ? ordersMap[tx.order_id] : null,
        user: tx.user_id ? usersMap[tx.user_id] : null,
      }));

      // Ensure payment_status is set from transaction or order
      // If order is cancelled, set payment_status to cancelled
      const transactionsWithStatus = (data || []).map((tx: any) => {
        // If order status is cancelled, payment_status should be cancelled
        if (tx.order?.status === 'cancelled') {
          return {
            ...tx,
            payment_status: 'cancelled',
          };
        }
        // Otherwise use transaction payment_status if available, otherwise fallback to order payment_status
        return {
          ...tx,
          payment_status: tx.payment_status || tx.order?.payment_status || 'pending',
        };
      });

      res.json({
        success: true,
        data: transactionsWithStatus,
      });
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      const errorCode = error?.code || null;
      const errorDetails = error?.details || null;
      const errorHint = error?.hint || null;
      
      console.error('Error fetching transactions:', {
        error,
        message: errorMessage,
        code: errorCode,
        details: errorDetails,
        hint: errorHint,
        stack: error?.stack,
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transactions',
        error: errorMessage,
        ...(errorCode && { code: errorCode }),
        ...(errorDetails && { details: errorDetails }),
        ...(errorHint && { hint: errorHint }),
      });
    }
  }

  // Get transaction by ID
  async getTransactionById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Try with foreign key relationships first, fallback to simple query if that fails
      let { data, error } = await supabaseAdmin
        .from('transactions')
        .select(`
          *,
          order:orders(id, order_number, total, status, payment_status),
          user:users(id, first_name, last_name, email)
        `)
        .eq('id', id)
        .single();

      // If foreign key join fails, try without joins
      if (error) {
        const errorWithCode = error as any;
        console.warn('Error fetching transaction with joins, trying without joins:', {
          code: errorWithCode.code,
          message: errorWithCode.message,
          details: errorWithCode.details,
          hint: errorWithCode.hint,
        });
        
        // Try simpler query without foreign key relationships
        const simpleResult = await supabaseAdmin
          .from('transactions')
          .select('*')
          .eq('id', id)
          .single();
        
        if (simpleResult.error) {
          throw simpleResult.error;
        }
        data = simpleResult.data;
        error = null;
      }

      if (error) throw error;

      // Ensure payment_status is set from transaction or order
      const transactionWithStatus = {
        ...data,
        // Use transaction payment_status if available, otherwise fallback to order payment_status
        payment_status: data.payment_status || data.order?.payment_status || 'pending',
      };

      res.json({
        success: true,
        data: transactionWithStatus,
      });
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      const errorCode = error?.code || null;
      const errorDetails = error?.details || null;
      const errorHint = error?.hint || null;
      
      console.error('Error fetching transaction:', {
        error,
        message: errorMessage,
        code: errorCode,
        details: errorDetails,
        hint: errorHint,
        stack: error?.stack,
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction',
        error: errorMessage,
        ...(errorCode && { code: errorCode }),
        ...(errorDetails && { details: errorDetails }),
        ...(errorHint && { hint: errorHint }),
      });
    }
  }

  // Update transaction payment status
  async updateTransactionStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { payment_status } = req.body;

      if (!payment_status || !['pending', 'paid', 'failed', 'refunded', 'cancelled'].includes(payment_status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment status. Must be: pending, paid, failed, refunded, or cancelled',
        });
      }

      // Get transaction with order data
      const { data: transaction, error: fetchError } = await supabaseAdmin
        .from('transactions')
        .select(`
          *,
          order:orders(id, order_number, status, payment_status)
        `)
        .eq('id', id)
        .single();

      if (fetchError || !transaction) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found',
        });
      }

      // Validation: Can only mark as "paid" (completed) if order is paid
      if (payment_status === 'paid') {
        const orderPaymentStatus = transaction.order?.payment_status;
        if (orderPaymentStatus !== 'paid') {
          return res.status(400).json({
            success: false,
            message: `Cannot mark transaction as completed. Order payment status is "${orderPaymentStatus}". Order must be marked as paid first.`,
          });
        }
      }

      // Update transaction
      const updateData: any = {
        payment_status,
        status: payment_status === 'paid' ? 'success' : payment_status === 'failed' || payment_status === 'cancelled' ? 'failed' : 'pending',
        updated_at: new Date().toISOString(),
      };

      // Set paid_at timestamp if marking as paid
      if (payment_status === 'paid' && !transaction.paid_at) {
        updateData.paid_at = new Date().toISOString();
      }

      const { data: updatedTransaction, error: updateError } = await supabaseAdmin
        .from('transactions')
        .update(updateData)
        .eq('id', id)
        .select(`
          *,
          order:orders(id, order_number, status, payment_status)
        `)
        .single();

      if (updateError) throw updateError;

      return res.json({
        success: true,
        message: 'Transaction status updated successfully',
        data: updatedTransaction,
      });
    } catch (error: any) {
      console.error('Error updating transaction status:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update transaction status',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

