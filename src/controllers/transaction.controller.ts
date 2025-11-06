import { Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';

export class TransactionController {
  // Get all transactions (admin)
  async getAllTransactions(req: Request, res: Response) {
    try {
      const { status, user_id, order_id } = req.query;
      
      let query = supabaseAdmin
        .from('transactions')
        .select(`
          *,
          order:orders!transactions_order_id_fkey(id, order_number, payment_status),
          user:users!transactions_user_id_fkey(id, first_name, last_name, email)
        `);

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

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      // Ensure payment_status is set from transaction or order
      const transactionsWithStatus = (data || []).map((tx: any) => ({
        ...tx,
        // Use transaction payment_status if available, otherwise fallback to order payment_status
        payment_status: tx.payment_status || tx.order?.payment_status || 'pending',
      }));

      res.json({
        success: true,
        data: transactionsWithStatus,
      });
    } catch (error) {
      console.error('Error fetching transactions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transactions',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Get transaction by ID
  async getTransactionById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select(`
          *,
          order:orders!transactions_order_id_fkey(id, order_number, total, status, payment_status),
          user:users!transactions_user_id_fkey(id, first_name, last_name, email)
        `)
        .eq('id', id)
        .single();

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
    } catch (error) {
      console.error('Error fetching transaction:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

