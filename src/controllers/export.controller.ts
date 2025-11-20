import { Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';
import { toCSV } from '../utils/csv.utils';

export class ExportController {
  // Export Orders
  async exportOrders(req: Request, res: Response) {
    try {
      const { startDate, endDate, status } = req.query;

      let query = supabaseAdmin
        .from('orders')
        .select(`
          *,
          user:users!orders_user_id_fkey(email, full_name),
          customer:customers!orders_customer_id_fkey(email, full_name, phone),
          order_items:order_items(product_name, quantity, unit_price, total_price)
        `);

      if (startDate) {
        query = query.gte('created_at', startDate as string);
      }
      if (endDate) {
        query = query.lte('created_at', endDate as string);
      }
      if (status && status !== 'all') {
        query = query.eq('status', status as string);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      const columns = [
        { header: 'Order ID', key: 'id' },
        { header: 'Order Number', key: 'order_number' },
        { header: 'Date', key: (row: any) => new Date(row.created_at).toLocaleString() },
        { header: 'Customer Name', key: (row: any) => row.user?.full_name || row.customer?.full_name || row.delivery_address?.full_name || 'Guest' },
        { header: 'Customer Email', key: (row: any) => row.user?.email || row.customer?.email || (row.delivery_address as any)?.email || '' },
        { header: 'Status', key: 'status' },
        { header: 'Payment Status', key: 'payment_status' },
        { header: 'Total', key: 'total' },
        { header: 'Items', key: (row: any) => row.order_items?.map((i: any) => `${i.quantity}x ${i.product_name}`).join('; ') || '' }
      ];

      const csv = toCSV(data || [], columns);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=orders_export_${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);

    } catch (error: any) {
      console.error('Export orders error:', error);
      res.status(500).json({ success: false, message: 'Failed to export orders' });
    }
  }

  // Export Transactions
  async exportTransactions(req: Request, res: Response) {
    try {
      const { startDate, endDate, status } = req.query;

      let query = supabaseAdmin
        .from('transactions')
        .select('*');

      if (startDate) {
        query = query.gte('created_at', startDate as string);
      }
      if (endDate) {
        query = query.lte('created_at', endDate as string);
      }
      if (status && status !== 'all') {
        query = query.eq('status', status as string);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      const columns = [
        { header: 'Transaction ID', key: 'id' },
        { header: 'Reference', key: 'transaction_reference' },
        { header: 'Date', key: (row: any) => new Date(row.created_at).toLocaleString() },
        { header: 'Amount', key: 'amount' },
        { header: 'Currency', key: 'currency' },
        { header: 'Status', key: 'status' },
        { header: 'Payment Method', key: 'payment_method' },
        { header: 'Customer Email', key: 'customer_email' }
      ];

      const csv = toCSV(data || [], columns);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=transactions_export_${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);

    } catch (error: any) {
      console.error('Export transactions error:', error);
      res.status(500).json({ success: false, message: 'Failed to export transactions' });
    }
  }
}

export default new ExportController();

