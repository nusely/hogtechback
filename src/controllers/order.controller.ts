import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { supabaseAdmin } from '../utils/supabaseClient';
import { commitDiscountUsage, evaluateDiscount } from '../services/discount.service';
import enhancedEmailService from '../services/enhanced-email.service';
import pdfService from '../services/pdf.service';
import { customerService } from '../services/customer.service';

export class OrderController {
  // Get all orders (admin)
  async getAllOrders(req: Request, res: Response) {
    try {
      const { user_id, status, page = 1, limit = 10, search, date_from, date_to, has_discount } = req.query;
      
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const offset = (pageNum - 1) * limitNum;

      let query = supabaseAdmin
        .from('orders')
        .select(`
          *,
          user:users!orders_user_id_fkey(id, first_name, last_name, full_name, email),
          customer:customers!orders_customer_id_fkey(id, full_name, email, phone, source),
          order_items:order_items(*)
        `, { count: 'exact' });

      // Filter by user_id if provided
      if (user_id) {
        query = query.eq('user_id', user_id as string);
      }

      // Filter by status if provided
      if (status && status !== 'all') {
        query = query.eq('status', status as string);
      }

      // Filter by date range
      if (date_from) {
        const fromDate = new Date(date_from as string);
        if (!isNaN(fromDate.getTime())) {
          query = query.gte('created_at', fromDate.toISOString());
        }
      }

      if (date_to) {
        const toDate = new Date(date_to as string);
        if (!isNaN(toDate.getTime())) {
          // Add one day and subtract 1ms to include the entire end date
          const endOfDay = new Date(toDate);
          endOfDay.setHours(23, 59, 59, 999);
          query = query.lte('created_at', endOfDay.toISOString());
        }
      }

      // Filter by discount
      const hasDiscountValue = typeof has_discount === 'string' ? has_discount.toLowerCase() : String(has_discount || '');
      if (hasDiscountValue === 'true') {
        query = query.gt('discount', 0);
      } else if (hasDiscountValue === 'false') {
        query = query.or('discount.is.null,discount.eq.0');
      }

      // Search by order number or customer email/name
      if (search) {
        query = query.or(`order_number.ilike.%${search}%`);
        // Note: searching across related tables (users/customers) is tricky in Supabase/PostgREST single query
        // We stick to order_number for now or denormalized fields if available
      }

      const { data, error, count } = await query
        .range(offset, offset + limitNum - 1)
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.json({
        success: true,
        data: data || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limitNum),
        }
      });
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch orders',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private normalizeImageUrl(imageUrl?: string | null): string | null {
    if (!imageUrl || typeof imageUrl !== 'string') {
      return null;
    }

    let url = imageUrl.trim();
    if (!url) {
      return null;
    }

    if (url.startsWith('data:')) {
      return url;
    }

    const frontendBase =
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'https://hogtechgh.com';
    const normalizedFrontendBase = frontendBase.replace(/\/$/, '');
    const r2Base = process.env.R2_PUBLIC_URL
      ? process.env.R2_PUBLIC_URL.replace(/\/$/, '')
      : 'https://files.hogtechgh.com';

    try {
      const parsed = new URL(url);
      if (parsed.pathname.startsWith('/_next/image')) {
        const originalUrl = parsed.searchParams.get('url');
        if (originalUrl) {
          return this.normalizeImageUrl(decodeURIComponent(originalUrl));
        }
      }
      return parsed.href;
    } catch {
      if (url.startsWith('//')) {
        return `https:${url}`;
      }
      if (url.startsWith('/')) {
        return `${normalizedFrontendBase}${url}`;
      }
      if (!/^https?:\/\//i.test(url)) {
        return `${r2Base}/${url.replace(/^\//, '')}`;
      }
      return url;
    }
  }

  // Get order by ID
  async getOrderById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const { data, error } = await supabaseAdmin
        .from('orders')
        .select(`
          *,
          user:users!orders_user_id_fkey(id, first_name, last_name, email),
          customer:customers!orders_customer_id_fkey(id, full_name, email, phone, source),
          order_items:order_items(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      const currentUser = req.user;
      const isAdminUser = currentUser?.role === 'admin';

      if (!isAdminUser) {
        if (!currentUser) {
          return res.status(401).json({
            success: false,
            message: 'Unauthorized',
          });
        }

        if (data.user_id !== currentUser.id) {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to this order',
          });
        }
      }

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Error fetching order:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch order',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Track order by order number and email (public, for guest customers)
  async trackOrder(req: Request, res: Response) {
    try {
      const { order_number, email } = req.body;

      if (!order_number || !email) {
        return res.status(400).json({
          success: false,
          message: 'Order number and email are required',
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

      // Find order by order number
      const { data: orderData, error: orderError } = await supabaseAdmin
        .from('orders')
        .select(`
          *,
          user:users!orders_user_id_fkey(id, first_name, last_name, email),
          customer:customers!orders_customer_id_fkey(id, full_name, email, phone, source),
          order_items:order_items(*)
        `)
        .eq('order_number', order_number.trim())
        .single();

      if (orderError || !orderData) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // Verify email matches (either user email or email in shipping_address)
      let emailMatches = false;
      
      if (orderData.customer && orderData.customer.email && orderData.customer.email.toLowerCase() === email.toLowerCase()) {
        emailMatches = true;
      } else if (orderData.user && orderData.user.email && orderData.user.email.toLowerCase() === email.toLowerCase()) {
        emailMatches = true;
      } else if (orderData.shipping_address && (orderData.shipping_address as any)?.email) {
        if ((orderData.shipping_address as any).email.toLowerCase() === email.toLowerCase()) {
          emailMatches = true;
        }
      } else if (orderData.delivery_address && (orderData.delivery_address as any)?.email) {
        if ((orderData.delivery_address as any).email.toLowerCase() === email.toLowerCase()) {
          emailMatches = true;
        }
      }

      if (!emailMatches) {
        return res.status(401).json({
          success: false,
          message: 'Email does not match this order',
        });
      }

      // Return order data (without sensitive information)
      res.json({
        success: true,
        data: {
          id: orderData.id,
          order_number: orderData.order_number,
          status: orderData.status,
          payment_status: orderData.payment_status,
          total: orderData.total,
          subtotal: orderData.subtotal,
          shipping_fee: orderData.shipping_fee,
          created_at: orderData.created_at,
          tracking_number: orderData.tracking_number,
          shipping_address: orderData.shipping_address,
          delivery_address: orderData.delivery_address,
          payment_method: orderData.payment_method,
          order_items: orderData.order_items,
          items: orderData.order_items, // Alias for compatibility
        },
      });
    } catch (error) {
      console.error('Error tracking order:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to track order',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Update order status
  async updateOrderStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, tracking_number, notes } = req.body;

      // Update order
      const { data: orderData, error: orderError } = await supabaseAdmin
        .from('orders')
        .update({
          status,
          tracking_number,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select(`
          *,
          user:users!orders_user_id_fkey(id, first_name, last_name, email),
          customer:customers!orders_customer_id_fkey(id, full_name, email, phone, source),
          order_items:order_items(*)
        `)
        .single();

      if (orderError) throw orderError;

      // If order is being cancelled, automatically mark associated transactions as failed
      if (status === 'cancelled') {
        try {
          const { data: transactions, error: transactionsError } = await supabaseAdmin
            .from('transactions')
            .select('id, payment_status')
            .eq('order_id', id);

          if (!transactionsError && transactions && transactions.length > 0) {
            // Update all transactions for this order to failed
            const { error: updateTransactionsError } = await supabaseAdmin
              .from('transactions')
              .update({
                payment_status: 'failed',
                status: 'failed',
                updated_at: new Date().toISOString(),
              })
              .eq('order_id', id);

            if (updateTransactionsError) {
              console.warn('Warning: Failed to update transactions when order was cancelled:', updateTransactionsError);
            } else {
              console.log(`✅ Automatically marked ${transactions.length} transaction(s) as failed for cancelled order ${id}`);
            }
          }
        } catch (transactionUpdateError: any) {
          // Don't fail the order update if transaction update fails
          console.warn('Warning: Error updating transactions when order was cancelled:', transactionUpdateError?.message || transactionUpdateError);
        }
      }

      // Send email notification (don't fail order update if email fails)
      try {
        // Determine customer email and name
        let customerEmail: string | null = null;
        let customerName: string = 'Customer';
        
        if (orderData.customer && orderData.customer.email) {
          customerEmail = orderData.customer.email;
          customerName = orderData.customer.full_name || customerName;
        } else if (orderData.user && orderData.user.email) {
          // Logged-in user
          customerEmail = orderData.user.email;
          customerName = `${orderData.user.first_name || ''} ${orderData.user.last_name || ''}`.trim() || 'Customer';
        } else if (orderData.shipping_address && (orderData.shipping_address as any)?.email) {
          // Guest checkout - get email from shipping address
          customerEmail = (orderData.shipping_address as any).email;
          customerName = orderData.shipping_address?.full_name || orderData.shipping_address?.first_name || 'Guest Customer';
        }

        if (customerEmail) {
          // Enrich order items with product images before sending email
          let enrichedItems = orderData.order_items || [];
          if (enrichedItems.length > 0) {
            const itemsWithProductIds = enrichedItems.filter((item: any) => item.product_id);
            if (itemsWithProductIds.length > 0) {
              const productIds = itemsWithProductIds.map((item: any) => item.product_id);
              const { data: products } = await supabaseAdmin
                .from('products')
                .select('id, thumbnail, image_url')
                .in('id', productIds);
              
              if (products && products.length > 0) {
                const productImageMap = new Map(
                  products.map((p: any) => {
                    const normalized = this.normalizeImageUrl(p.thumbnail || p.image_url || null);
                    return [p.id, normalized];
                  })
                );
                
                enrichedItems = enrichedItems.map((item: any) => {
                  if (item.product_id && productImageMap.has(item.product_id)) {
                    const imageUrl = productImageMap.get(item.product_id);
                    return {
                      ...item,
                      product_image: imageUrl,
                      image: imageUrl,
                      thumbnail: imageUrl,
                    };
                  }
                  return item;
                });
              }
            }
          }

          const emailData = {
            ...orderData,
            customer_name: customerName,
            customer_email: customerEmail,
            items: enrichedItems,
            delivery_address: orderData.shipping_address || orderData.delivery_address, // For email template compatibility
          };

          const emailResult = await enhancedEmailService.sendOrderStatusUpdate(emailData, status);
          if (emailResult.skipped) {
            console.log(`Order status update email skipped: ${emailResult.reason}`);
          } else if (emailResult.success) {
            console.log('Order status update email sent successfully to', customerEmail);
          } else {
            console.error('Failed to send order status update email:', emailResult.reason);
          }
        } else {
          console.warn('No email found for order status update. Order:', orderData.id);
        }
      } catch (emailError: any) {
        // Don't fail the order update if email sending fails
        console.error('Error sending order status update email (order update still succeeded):', emailError?.message || emailError);
        // Continue with order update success - don't throw error
      }

      res.json({
        success: true,
        message: 'Order status updated successfully',
        data: orderData,
      });
    } catch (error) {
      console.error('Error updating order status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update order status',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Update order details (shipping cost, notes, etc.)
  async updateOrderDetails(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { shipping_fee, notes } = req.body;

      // Validate shipping_fee if provided
      if (shipping_fee !== undefined && (isNaN(Number(shipping_fee)) || Number(shipping_fee) < 0)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid shipping fee. Must be a non-negative number',
        });
      }

      // Get current order to calculate new total
      const { data: currentOrder, error: fetchError } = await supabaseAdmin
        .from('orders')
        .select('subtotal, discount, tax, shipping_fee, total, notes')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      if (!currentOrder) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      // Calculate new total if shipping_fee is being updated
      const newShippingFee = shipping_fee !== undefined ? Number(shipping_fee) : currentOrder.shipping_fee;
      const newTotal = Number(currentOrder.subtotal) - Number(currentOrder.discount || 0) + Number(currentOrder.tax || 0) + newShippingFee;

      // Prepare update data
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (shipping_fee !== undefined) {
        updateData.shipping_fee = newShippingFee;
        updateData.total = newTotal;
      }

      if (notes !== undefined) {
        updateData.notes = notes || null;
      }

      // Update order
      const { data: orderData, error: orderError } = await supabaseAdmin
        .from('orders')
        .update(updateData)
        .eq('id', id)
        .select(`
          *,
          user:users!orders_user_id_fkey(id, first_name, last_name, email),
          customer:customers!orders_customer_id_fkey(id, full_name, email, phone, source),
          order_items:order_items(*)
        `)
        .single();

      if (orderError) throw orderError;

      // Send email notification (don't fail order update if email fails)
      try {
        // Determine customer email and name
        let customerEmail: string | null = null;
        let customerName: string = 'Customer';
        
        if (orderData.customer && orderData.customer.email) {
          customerEmail = orderData.customer.email;
          customerName = orderData.customer.full_name || customerName;
        } else if (orderData.user && orderData.user.email) {
          customerEmail = orderData.user.email;
          customerName = `${orderData.user.first_name || ''} ${orderData.user.last_name || ''}`.trim() || 'Customer';
        } else if (orderData.shipping_address && (orderData.shipping_address as any)?.email) {
          customerEmail = (orderData.shipping_address as any).email;
          customerName = orderData.shipping_address?.full_name || orderData.shipping_address?.first_name || 'Guest Customer';
        }

        if (customerEmail) {
          const emailData = {
            ...orderData,
            customer_name: customerName,
            customer_email: customerEmail,
            items: orderData.order_items || [],
            delivery_address: orderData.shipping_address || orderData.delivery_address,
          };

          // Send order update email (not status update, but order details update)
          const emailResult = await enhancedEmailService.sendOrderUpdate(emailData, {
            shipping_fee_changed: shipping_fee !== undefined && shipping_fee !== currentOrder.shipping_fee,
            notes_added: notes !== undefined && notes !== currentOrder.notes,
            old_shipping_fee: currentOrder.shipping_fee,
            new_shipping_fee: newShippingFee,
            notes: notes || orderData.notes,
          });

          if (emailResult.skipped) {
            console.log(`Order update email skipped: ${emailResult.reason}`);
          } else if (emailResult.success) {
            console.log('Order update email sent successfully to', customerEmail);
          } else {
            console.error('Failed to send order update email:', emailResult.reason);
          }
        } else {
          console.warn('No email found for order update. Order:', orderData.id);
        }
      } catch (emailError: any) {
        // Don't fail the order update if email sending fails
        console.error('Error sending order update email (order update still succeeded):', emailError?.message || emailError);
      }

      res.json({
        success: true,
        message: 'Order details updated successfully',
        data: orderData,
      });
    } catch (error) {
      console.error('Error updating order details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update order details',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Update payment status
  async updatePaymentStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { payment_status } = req.body;

      if (!payment_status || !['pending', 'paid', 'failed', 'refunded'].includes(payment_status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid payment status. Must be: pending, paid, failed, or refunded',
        });
      }

      // Update payment status in orders table
      const { data: orderData, error: orderError } = await supabaseAdmin
        .from('orders')
        .update({
          payment_status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select(`
          *,
          user:users!orders_user_id_fkey(id, first_name, last_name, email),
          customer:customers!orders_customer_id_fkey(id, full_name, email, phone, source),
          order_items:order_items(*)
        `)
        .single();

      if (orderError) throw orderError;

      // Also update or create the transaction's payment_status to keep it in sync
      try {
        // Check if transaction exists
        const { data: existingTransaction } = await supabaseAdmin
          .from('transactions')
          .select('id')
          .eq('order_id', id)
          .maybeSingle();

        if (existingTransaction) {
          // Update existing transaction
          const { error: transactionError } = await supabaseAdmin
            .from('transactions')
            .update({
              payment_status,
              status: payment_status === 'paid' ? 'success' : payment_status === 'failed' ? 'failed' : 'pending',
              paid_at: payment_status === 'paid' ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq('order_id', id);

          if (transactionError) {
            console.warn('Warning: Failed to update transaction payment_status:', transactionError);
          } else {
            console.log(`✅ Updated transaction payment_status to ${payment_status} for order ${id}`);
          }
        } else if (payment_status === 'paid') {
          // Create transaction if it doesn't exist and order is being marked as paid
          const customerEmail = orderData.user?.email || 
                               orderData.customer?.email || 
                               (orderData.shipping_address as any)?.email ||
                               'no-email@example.com';
          
          const customerName = orderData.user?.full_name ||
                              `${orderData.user?.first_name || ''} ${orderData.user?.last_name || ''}`.trim() ||
                              orderData.customer?.full_name ||
                              (orderData.shipping_address as any)?.full_name ||
                              'Customer';

          const transactionData = {
            order_id: id,
            user_id: orderData.user_id || null,
            transaction_reference: orderData.payment_reference || 
                                 (orderData.shipping_address as any)?.payment_reference ||
                                 `TXN-${id.slice(0, 8)}-${orderData.order_number}`,
            payment_method: orderData.payment_method || 'cash_on_delivery',
            payment_provider: orderData.payment_method === 'paystack' ? 'paystack' : 
                             orderData.payment_method === 'cash_on_delivery' ? 'cash' : 'other',
            amount: orderData.total || 0,
            currency: 'GHS',
            status: 'success',
            payment_status: 'paid',
            customer_email: customerEmail,
            metadata: {
              order_number: orderData.order_number,
              customer_name: customerName,
              subtotal: orderData.subtotal || 0,
              discount: orderData.discount || 0,
              tax: orderData.tax || 0,
              shipping_fee: orderData.delivery_fee || 0,
              total: orderData.total || 0,
              payment_method: orderData.payment_method,
              order_id: id,
              created_from_status_update: true, // Mark as created from status update
            },
            initiated_at: orderData.created_at || new Date().toISOString(),
            paid_at: new Date().toISOString(),
            created_at: orderData.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const { error: createTransactionError } = await supabaseAdmin
            .from('transactions')
            .insert([transactionData]);

          if (createTransactionError) {
            console.warn('Warning: Failed to create transaction when updating payment status:', createTransactionError);
          } else {
            console.log(`✅ Created transaction for order ${id} when payment status was updated to paid`);
          }
        }
      } catch (transactionUpdateError) {
        console.warn('Warning: Error updating/creating transaction payment_status:', transactionUpdateError);
        // Don't fail the request if transaction update fails
      }

      res.json({
        success: true,
        message: 'Payment status updated successfully',
        data: orderData,
      });
    } catch (error) {
      console.error('Error updating payment status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update payment status',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Cancel order
  async cancelOrder(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { cancellation_reason } = req.body;

      const { data: existingOrder, error: fetchError } = await supabaseAdmin
        .from('orders')
        .select('id, user_id, status, payment_status')
        .eq('id', id)
        .single();

      if (fetchError || !existingOrder) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      const requesterId = req.user?.id;
      const requesterRole = req.user?.role;
      const isAdmin = requesterRole === 'admin' || requesterRole === 'superadmin';
      const isOwner = requesterId ? existingOrder.user_id === requesterId : false;
      const shouldFailPayment = isOwner && !isAdmin;

      if (!isAdmin && !isOwner) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to cancel this order',
        });
      }

      if (!isAdmin && existingOrder.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Only pending orders can be cancelled',
        });
      }

      const updatePayload: Record<string, any> = {
        status: 'cancelled',
        notes: cancellation_reason,
        updated_at: new Date().toISOString(),
      };

      if (shouldFailPayment) {
        updatePayload.payment_status = 'failed';
      }

      // Update order
      const { data: orderData, error: orderError } = await supabaseAdmin
        .from('orders')
        .update(updatePayload)
        .eq('id', id)
        .select(`
          *,
          user:users!orders_user_id_fkey(id, first_name, last_name, email),
          customer:customers!orders_customer_id_fkey(id, full_name, email, phone, source),
          order_items:order_items(*)
        `)
        .single();

      if (orderError) throw orderError;

      if (shouldFailPayment) {
        try {
          const { error: transactionError } = await supabaseAdmin
            .from('transactions')
            .update({
              payment_status: 'failed',
              status: 'failed',
              updated_at: new Date().toISOString(),
            })
            .eq('order_id', id);

          if (transactionError) {
            console.warn('Warning: Failed to mark related transaction as failed during cancellation:', transactionError);
          }
        } catch (transactionUpdateError) {
          console.warn('Warning: Error updating transaction during cancellation:', transactionUpdateError);
        }
      }

      const customerName =
        orderData.customer?.full_name ||
        orderData.user?.full_name ||
        `${orderData.user?.first_name || ''} ${orderData.user?.last_name || ''}`.trim() ||
        orderData.shipping_address?.full_name ||
        orderData.delivery_address?.full_name ||
        'Customer';

      const customerEmail =
        orderData.customer?.email ||
        orderData.user?.email ||
        orderData.shipping_address?.email ||
        orderData.delivery_address?.email ||
        null;

      // Send cancellation email
      try {
        if (customerEmail) {
          const emailResult = await enhancedEmailService.sendOrderCancellation({
            ...orderData,
            customer_name: customerName,
            customer_email: customerEmail,
            cancellation_reason: cancellation_reason || (shouldFailPayment ? 'Cancelled by customer' : 'Cancelled by admin'),
            cancelled_by: isOwner ? 'customer' : requesterRole || 'unknown',
          });
          if (emailResult.skipped) {
            console.log(`Order cancellation email skipped: ${emailResult.reason}`);
          } else if (emailResult.success) {
            console.log('Order cancellation email sent successfully');
          } else {
            console.error('Failed to send order cancellation email:', emailResult.reason);
          }
        } else {
          console.warn('Order cancellation email not sent - no customer email available.');
        }
      } catch (emailError) {
        console.error('Failed to send order cancellation email:', emailError);
        // Don't fail the request if email fails
      }

      res.json({
        success: true,
        message: 'Order cancelled successfully',
        data: orderData,
      });
    } catch (error) {
      console.error('Error cancelling order:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel order',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Generate sequential order number (format: ORD-XXXDDMMYY)
  private async generateOrderNumber(): Promise<string> {
    try {
      // Get today's date in DDMMYY format
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = String(now.getFullYear()).slice(-2);
      const dateStr = `${day}${month}${year}`;

      // Get the last order number for today to generate sequential number
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const { data: lastOrder } = await supabaseAdmin
        .from('orders')
        .select('order_number')
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let sequence = 1;
      if (lastOrder && lastOrder.order_number) {
        // Extract sequence from last order number (ORD-XXXDDMMYY)
        const match = lastOrder.order_number.match(/ORD-(\d{3})/);
        if (match) {
          sequence = parseInt(match[1]) + 1;
          // Reset to 1 if sequence exceeds 999 (shouldn't happen in one day)
          if (sequence > 999) sequence = 1;
        }
      }

      // Format sequence as 3 digits (001, 002, etc.)
      const sequenceStr = String(sequence).padStart(3, '0');
      return `ORD-${sequenceStr}${dateStr}`;
    } catch (error) {
      console.error('Error generating order number:', error);
      // Fallback: use timestamp-based number
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = String(now.getFullYear()).slice(-2);
      const dateStr = `${day}${month}${year}`;
      const sequenceStr = String(Date.now()).slice(-3);
      return `ORD-${sequenceStr}${dateStr}`;
    }
  }

  // Create order (with email confirmation)
  async createOrder(req: AuthRequest, res: Response) {
    try {
      console.log('📦 Order creation request received:', {
        hasUserId: !!req.body.user_id,
        hasOrderItems: !!req.body.order_items,
        orderItemsCount: req.body.order_items?.length || 0,
        hasDeliveryAddress: !!req.body.delivery_address,
        paymentMethod: req.body.payment_method,
        paymentReference: req.body.payment_reference,
        total: req.body.total,
      });

      const {
        user_id,
        customer_id: providedCustomerId,
        order_number, // Optional - will be generated if not provided
        subtotal,
        discount_code,
        tax,
        delivery_fee,
        delivery_option,
        total: providedTotalRaw,
        payment_method,
        delivery_address,
        order_items,
        notes,
        payment_reference,
      } = req.body;

      // Validate required fields
      if (!order_items || !Array.isArray(order_items) || order_items.length === 0) {
        console.error('❌ Order creation failed: No order items provided');
        return res.status(400).json({
          success: false,
          message: 'Order items are required',
          error: 'No order items provided',
        });
      }

      if (!delivery_address) {
        console.error('❌ Order creation failed: No delivery address provided');
        return res.status(400).json({
          success: false,
          message: 'Delivery address is required',
          error: 'No delivery address provided',
        });
      }

      const providedTotal = typeof providedTotalRaw === 'number' ? Number(providedTotalRaw) : null;

      const actor = req.user ?? null;

      let userData: any = null;
      if (user_id) {
        const { data, error: userError } = await supabaseAdmin
          .from('users')
          .select('id, email, full_name, first_name, last_name, phone')
          .eq('id', user_id)
          .maybeSingle();

        if (!userError) {
          userData = data;
        }
      }

      if (!userData && actor) {
        userData = {
          id: actor.id,
          email: actor.email,
          full_name: actor.full_name,
          first_name: actor.first_name,
          last_name: actor.last_name,
          phone: actor.phone,
        };
      }

      const sanitizedOrderItems = order_items.map((item: any) => ({
        product_id: item.product_id ?? item.id ?? null,
        product_name: item.product_name || item.name || 'Deal Product',
        quantity: Number(item.quantity) || 1,
        unit_price: Number(
          item.unit_price ?? item.price ?? item.original_price ?? 0
        ),
        subtotal: Number(item.subtotal ?? item.total_price ?? 0),
      }));

      const computedSubtotal = sanitizedOrderItems.reduce((sum, item) => sum + item.subtotal, 0);
      const normalizedDeliveryFee = Number(delivery_fee ?? delivery_option?.price ?? 0) || 0;

      // Discount code application - ONLY applies to product subtotal (not shipping)
      let appliedDiscountAmount = 0;
      let appliedDiscountCode: string | null = null;
      let adjustedDeliveryFee = normalizedDeliveryFee;
      let discountRecordId: string | null = null;

      if (discount_code) {
        try {
          console.log('🔍 Validating discount code:', discount_code);
          // Force discount to apply only to products, not shipping
          const discountResult = await evaluateDiscount({
            code: discount_code,
            subtotal: computedSubtotal,
            deliveryFee: normalizedDeliveryFee,
            items: sanitizedOrderItems,
          });

          appliedDiscountAmount = discountResult.discountAmount;
          appliedDiscountCode = discountResult.code;
          // Only adjust delivery fee if it's a free_shipping coupon
          adjustedDeliveryFee = discountResult.type === 'free_shipping' ? discountResult.adjustedDeliveryFee : normalizedDeliveryFee;
          discountRecordId = discountResult.discountId;

          console.log('✅ Discount applied:', {
            code: appliedDiscountCode,
            amount: appliedDiscountAmount,
            type: discountResult.type,
            adjustedDeliveryFee,
          });
        } catch (discountError: any) {
          console.warn('⚠️ Invalid discount code provided:', discount_code, discountError.message);
          // We don't fail the order, just ignore the invalid discount
        }
      }

      // Calculate discounted subtotal (products only - discount does NOT apply to shipping)
      const discountedSubtotal = Math.max(0, computedSubtotal - appliedDiscountAmount);

      // Tax should be calculated on the DISCOUNTED product subtotal (not original subtotal)
      // Use the tax provided from frontend (which should already be calculated on discounted amount)
      // If not provided, tax would be 0 (frontend should always provide it)
      let normalizedTax = Number(tax ?? 0) || 0;
      
      // Log for verification
      console.log('💰 Order calculation:', {
        originalSubtotal: computedSubtotal,
        discountAmount: appliedDiscountAmount,
        discountedSubtotal,
        tax: normalizedTax,
        shipping: adjustedDeliveryFee,
        total: discountedSubtotal + normalizedTax + adjustedDeliveryFee,
      });
      
      // Final total: discounted product subtotal + tax (on discounted amount) + shipping
      const computedTotal = Number(
        (discountedSubtotal + normalizedTax + adjustedDeliveryFee).toFixed(2)
      );

      if (computedTotal <= 0) {
        console.error('❌ Order creation failed: Computed total amount invalid', {
          computedSubtotal,
          appliedDiscountAmount,
          adjustedDeliveryFee,
          normalizedTax,
        });
        return res.status(400).json({
          success: false,
          message: 'Invalid order total after applying discount',
        });
      }

      if (providedTotal !== null) {
        if (providedTotal <= 0) {
          console.warn('⚠️ Client provided non-positive total. Using server computed total instead.', {
            providedTotal,
            computedTotal,
          });
        } else if (Math.abs(providedTotal - computedTotal) > 0.5) {
          console.warn('⚠️ Client/server total mismatch detected.', {
            providedTotal,
            computedTotal,
          });
        }
      }

      // Generate order number if not provided (backend generates sequential number)
      const finalOrderNumber = order_number || await this.generateOrderNumber();
      console.log('✅ Generated order number:', finalOrderNumber);

      // Map delivery_address to shipping_address and include delivery_option in the address JSON
      const shippingAddress = delivery_address ? {
        ...delivery_address,
        delivery_option: delivery_option || { name: 'Standard', price: adjustedDeliveryFee },
      } : null;

      const shipping = shippingAddress as Record<string, any> | null;
      const shippingFullName = typeof shipping?.full_name === 'string' ? shipping.full_name.trim() : '';
      const shippingNameFromParts = [shipping?.first_name, shipping?.last_name]
        .filter((part) => typeof part === 'string' && part.trim().length > 0)
        .join(' ');

      const candidateName = (userData?.full_name || shippingFullName || shippingNameFromParts)?.trim() || null;
      const candidateEmail = (userData?.email || (typeof shipping?.email === 'string' ? shipping.email : null))?.trim() || null;
      const candidatePhone = (typeof shipping?.phone === 'string' && shipping.phone.trim().length > 0)
        ? shipping.phone.trim()
        : (typeof userData?.phone === 'string' ? userData.phone.trim() : null);

      let resolvedCustomer: any = null;
      let customerId = providedCustomerId;

      try {
        if (customerId) {
          resolvedCustomer = await customerService.findById(customerId);
          if (!resolvedCustomer) {
            return res.status(400).json({
              success: false,
              message: 'Customer not found. Please refresh and try again.',
            });
          }
        } else if (candidateEmail || candidatePhone) {
          const customerRecord = await customerService.upsertCustomer({
            userId: user_id || null,
            email: candidateEmail,
            fullName: candidateName,
            phone: candidatePhone,
            createdBy: actor?.id || null,
            source: user_id
              ? 'registered'
              : actor?.role === 'admin'
              ? 'admin_manual_order'
              : 'guest_checkout',
          });
          resolvedCustomer = customerRecord;
          customerId = customerRecord?.id || null;
        }
      } catch (customerError: any) {
        console.error('Customer upsert failed during order creation:', customerError);
        return res.status(400).json({
          success: false,
          message: customerError?.message || 'Unable to associate order with customer',
        });
      }

      if (!customerId && (candidateEmail || candidatePhone)) {
        try {
          const fallbackCustomer = await customerService.upsertCustomer({
            userId: null,
            email: candidateEmail,
            fullName: candidateName,
            phone: candidatePhone,
            createdBy: actor?.id || null,
            source: actor?.role === 'admin' ? 'admin_manual_order' : 'guest_checkout',
          });
          resolvedCustomer = fallbackCustomer;
          customerId = fallbackCustomer?.id || null;
        } catch (fallbackError) {
          console.error('Fallback customer creation failed:', fallbackError);
        }
      }

      // Create order
      // Note: payment_reference column does NOT exist in orders table
      // Store it in shipping_address JSON instead (if provided)
      const orderInsertData: any = {
        user_id,
        customer_id: customerId,
        order_number: finalOrderNumber,
        subtotal: Number(computedSubtotal.toFixed(2)),
        discount: appliedDiscountAmount,
        tax: normalizedTax,
        shipping_fee: adjustedDeliveryFee,
        total: computedTotal,
        payment_method,
        shipping_address: shippingAddress ? {
          ...shippingAddress,
          // Only include payment_reference if provided (store in shipping_address JSON)
          ...(payment_reference ? { payment_reference } : {}),
        } : null,
        notes: notes || null,
        discount_code: appliedDiscountCode,
        status: 'pending',
        payment_status: payment_method === 'cash_on_delivery' ? 'pending' : 'pending', // Will be updated when payment verified
      };

      // DO NOT include payment_reference as a direct column - it doesn't exist in orders table
      // It's already stored in shipping_address JSON above (if provided)

      const { data: orderData, error: orderError } = await supabaseAdmin
        .from('orders')
        .insert([orderInsertData])
        .select()
        .single();

      if (orderError) {
        console.error('❌ Order creation failed:', orderError);
        throw orderError;
      }
      
      console.log('✅ Order created successfully:', {
        id: orderData.id,
        order_number: orderData.order_number,
        user_id: orderData.user_id,
      });

      // Determine which order items map to actual catalog products
      const productIdCandidates = Array.from(
        new Set(
          order_items
            .map((item: any) => {
              if (typeof item.product_id === 'string' && item.product_id.trim().length > 0) {
                return item.product_id.trim();
              }
              if (typeof item.id === 'string' && item.id.trim().length > 0) {
                return item.id.trim();
              }
              return null;
            })
            .filter((id: string | null): id is string => id !== null)
        )
      );

      let validProductIds = new Set<string>();
      if (productIdCandidates.length > 0) {
        const { data: existingProducts, error: existingProductsError } = await supabaseAdmin
          .from('products')
          .select('id')
          .in('id', productIdCandidates);

        if (existingProductsError) {
          console.warn('⚠️ Error validating product references for order:', existingProductsError);
        } else if (existingProducts) {
          validProductIds = new Set(existingProducts.map((product: any) => product.id));
        }
      }

      // Create order items and decrease stock
      let hasStandaloneItems = false;

      const orderItems = order_items.map((item: any) => {
        const candidateId = typeof item.product_id === 'string' && item.product_id.trim().length > 0
          ? item.product_id.trim()
          : typeof item.id === 'string' && item.id.trim().length > 0
            ? item.id.trim()
            : null;
        const hasValidProduct = !!(candidateId && validProductIds.has(candidateId));

        if (!hasValidProduct) {
          hasStandaloneItems = true;
        }

        const quantity = Number(item.quantity) || 1;
        const unitPrice = Number(
          item.unit_price ?? item.price ?? item.original_price ?? 0
        );
        const totalPrice = Number(
          item.subtotal ?? item.total_price ?? unitPrice * quantity
        );

        // Normalize image URL - ensure we always have a valid URL (use placeholder if needed)
        let normalizedImage = this.normalizeImageUrl(item.product_image || item.thumbnail || item.image || null);
        
        // If normalizedImage is null, use placeholder
        if (!normalizedImage) {
          const r2Base = process.env.R2_PUBLIC_URL
            ? process.env.R2_PUBLIC_URL.replace(/\/$/, '')
            : 'https://files.hogtechgh.com';
          normalizedImage = `${r2Base}/placeholder-product.webp`;
        }
        
        const standaloneSourceId = !hasValidProduct
          ? (
            typeof item.standalone_source_id === 'string' && item.standalone_source_id.trim().length > 0
              ? item.standalone_source_id.trim()
              : typeof item.id === 'string' && item.id.trim().length > 0
                ? item.id.trim()
                : null
          )
          : null;

        const dealSnapshot = !hasValidProduct
          ? {
              source: 'deal_product',
              deal_product_id: standaloneSourceId,
              deal_id: item.deal_id || null,
              product_name: item.product_name || item.name || 'Deal Product',
              product_description: item.product_description || null,
              image: normalizedImage,
              unit_price: unitPrice,
              original_price: item.original_price ?? item.price ?? null,
              discount_percentage: item.discount_percentage ?? null,
            }
          : null;

        // Build order item payload - matching actual database schema
        const orderItemPayload: any = {
          order_id: orderData.id,
          product_id: hasValidProduct ? candidateId : null,
          product_name: item.product_name || item.name || 'Deal Product',
          quantity,
          unit_price: unitPrice,
          subtotal: totalPrice, // Database uses 'subtotal' not 'total_price'
          variant_options: item.selected_variants || {}, // Database uses 'variant_options' not 'selected_variants'
          // Note: product_image column doesn't exist in the database schema
          // But we'll include it in the payload for email purposes (won't be saved to DB)
          product_image: normalizedImage, // For email template - always has a value (placeholder if needed)
          image: normalizedImage, // Alternative field name for email compatibility
          thumbnail: normalizedImage, // Another alternative
        };

        // Include deal_product_id and deal_snapshot if they exist
        if (standaloneSourceId) {
          orderItemPayload.deal_product_id = standaloneSourceId;
        }
        if (dealSnapshot) {
          orderItemPayload.deal_snapshot = dealSnapshot;
        }

        return orderItemPayload;
      });

      // ALWAYS fetch product images from database to ensure we have the latest images
      const r2Base = process.env.R2_PUBLIC_URL
        ? process.env.R2_PUBLIC_URL.replace(/\/$/, '')
        : 'https://files.hogtechgh.com';
      const placeholderUrl = `${r2Base}/placeholder-product.webp`;
      
      const itemsWithProductIds = orderItems.filter(item => item.product_id);
      
      if (itemsWithProductIds.length > 0) {
        const productIds = itemsWithProductIds.map(item => item.product_id);
        console.log('📧 Fetching product images from database for order items:', productIds);
        
        const { data: products, error: productsError } = await supabaseAdmin
          .from('products')
          .select('id, thumbnail, image_url')
          .in('id', productIds);
        
        if (!productsError && products && products.length > 0) {
          console.log(`📧 Found ${products.length} products in database`);
          
          const productImageMap = new Map(
            products.map((p: any) => {
              const normalized = this.normalizeImageUrl(p.thumbnail || p.image_url || null);
              const finalUrl = normalized || placeholderUrl;
              console.log(`📧 Product ${p.id}: ${p.thumbnail || p.image_url || 'no image'} -> ${finalUrl}`);
              return [p.id, finalUrl];
            })
          );
          
          // Update images in orderItems for email purposes - always use database images
          orderItems.forEach(item => {
            if (item.product_id && productImageMap.has(item.product_id)) {
              const imageUrl = productImageMap.get(item.product_id);
              item.product_image = imageUrl;
              item.image = imageUrl;
              item.thumbnail = imageUrl;
              console.log(`📧 Updated item "${item.product_name}" (${item.product_id}) with image: ${imageUrl}`);
            } else if (item.product_id) {
              // Product exists but no image found in database - use placeholder
              console.log(`📧 Product ${item.product_id} not found in database, using placeholder`);
              item.product_image = placeholderUrl;
              item.image = placeholderUrl;
              item.thumbnail = placeholderUrl;
            }
          });
        } else if (productsError) {
          console.error('📧 Error fetching products for images:', productsError);
        } else {
          console.warn('📧 No products found in database for product IDs:', productIds);
        }
      }
      
      // Ensure all items have at least a placeholder image
      orderItems.forEach(item => {
        if (!item.product_image || !item.image || !item.thumbnail) {
          console.log(`📧 Item "${item.product_name}" missing image, adding placeholder`);
          item.product_image = placeholderUrl;
          item.image = placeholderUrl;
          item.thumbnail = placeholderUrl;
        }
      });
      
      // Log order items with images for debugging
      console.log('📧 Final order items prepared for email:', orderItems.map(item => ({
        product_name: item.product_name,
        product_id: item.product_id,
        product_image: item.product_image,
        image: item.image,
        thumbnail: item.thumbnail,
        has_valid_image: !!item.product_image && !item.product_image.includes('placeholder'),
      })));

      // Insert order items (product_image fields will be ignored by database)
      const { error: itemsError } = await supabaseAdmin
        .from('order_items')
        .insert(orderItems.map(({ product_image, image, thumbnail, ...item }) => item)); // Remove image fields before insert

      if (itemsError) {
        console.error('❌ Order items creation failed:', itemsError);
        throw itemsError;
      }
      
      console.log(`✅ Created ${orderItems.length} order items`);

      if (customerId) {
        await customerService.touchLastOrder(customerId).catch((touchError) => {
          console.error('Failed to update customer last_order_at:', touchError);
        });
      }

      // Decrease stock for each product in the order
      try {
        for (const item of orderItems) {
          if (item.product_id) {
          const { data: product, error: productError } = await supabaseAdmin
            .from('products')
            .select('stock_quantity, in_stock')
            .eq('id', item.product_id)
            .single();

          if (!productError && product) {
            const currentStock = product.stock_quantity || 0;
            const newStock = Math.max(0, currentStock - item.quantity);
            const newInStock = newStock > 0;

            const { error: updateError } = await supabaseAdmin
              .from('products')
              .update({
                stock_quantity: newStock,
                in_stock: newInStock,
              })
              .eq('id', item.product_id);

            if (updateError) {
              console.error(`❌ Failed to update stock for product ${item.product_id}:`, updateError);
            } else {
              console.log(`✅ Decreased stock for product ${item.product_id}: ${currentStock} → ${newStock}`);
            }
          } else {
            console.error(`❌ Error fetching product ${item.product_id} for stock update:`, productError);
          }
          }
          // TODO: Uncomment when deal_product_id column is added and schema cache is refreshed
          // Deal product stock update code commented out until migration is complete
          // } else if (item.deal_product_id) {
          //   const { data: dealProduct, error: dealProductError } = await supabaseAdmin
          //     .from('deal_products')
          //     .select('stock_quantity')
          //     .eq('id', item.deal_product_id)
          //     .single();

          //   if (!dealProductError && dealProduct && dealProduct.stock_quantity !== null) {
          //     const currentStock = dealProduct.stock_quantity || 0;
          //     const newStock = Math.max(0, currentStock - item.quantity);

          //     const { error: updateDealStockError } = await supabaseAdmin
          //       .from('deal_products')
          //       .update({ stock_quantity: newStock })
          //       .eq('id', item.deal_product_id);

          //     if (updateDealStockError) {
          //       console.error(
          //         `❌ Failed to update stock for deal product ${item.deal_product_id}:`,
          //         updateDealStockError
          //       );
          //     } else {
          //       console.log(
          //         `✅ Decreased stock for deal product ${item.deal_product_id}: ${currentStock} → ${newStock}`
          //       );
          //     }
          //   } else if (dealProductError) {
          //     console.error(
          //       `❌ Error fetching deal product ${item.deal_product_id} for stock update:`,
          //       dealProductError
          //     );
          //   }
          // }
        }
      } catch (stockError) {
        console.error('❌ Error updating product stock:', stockError);
        // Don't fail order creation if stock update fails - log and continue
        // This allows the order to be created even if stock update fails
      }

      // Create transaction record for this order (even if pending)
      // This ensures all orders have a transaction record for tracking
      try {
        // Determine customer email and name
        let customerEmail: string | null = null;
        let customerName: string = 'Customer';
        let customerPhone = resolvedCustomer?.phone || null;
        
        if (resolvedCustomer?.email) {
          customerEmail = resolvedCustomer.email;
          customerName = resolvedCustomer.full_name || customerName;
        } else if (userData?.email) {
          // Logged-in user
          customerEmail = userData.email;
          customerName =
            userData.full_name || `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'Customer';
        } else if (shippingAddress && (shippingAddress as any)?.email) {
          // Guest checkout - get email from shipping address
          customerEmail = (shippingAddress as any).email;
          customerName = shippingAddress?.full_name || shippingAddress?.first_name || 'Guest Customer';
        }

        if (!customerPhone && userData?.phone) {
          customerPhone = userData.phone;
        }

        if (!customerPhone && shippingAddress && (shippingAddress as any)?.phone) {
          customerPhone = (shippingAddress as any).phone;
        }

        // Get order payment_status to sync with transaction
        const orderPaymentStatus = orderData.payment_status || 'pending';
        
        const transactionData: any = {
          order_id: orderData.id,
          user_id: user_id || null,
          transaction_reference: payment_reference || `TXN-${orderData.id.slice(0, 8)}`,
          payment_method: payment_method || 'cash_on_delivery',
          payment_provider: payment_method === 'paystack' ? 'paystack' : payment_method === 'cash_on_delivery' ? 'cash' : 'other',
          amount: computedTotal,
          currency: 'GHS',
          status: orderPaymentStatus === 'paid' ? 'success' : orderPaymentStatus === 'failed' ? 'failed' : 'pending',
          payment_status: orderPaymentStatus, // Sync with order payment_status
          customer_email: customerEmail || 'no-email@example.com', // Required field - provide default if missing
          metadata: {
            order_number: order_number,
            customer_name: customerName, // Store customer name in metadata
          subtotal: computedSubtotal,
          discount: appliedDiscountAmount,
          discount_code: appliedDiscountCode,
          tax: normalizedTax,
          shipping_fee: adjustedDeliveryFee,
          total: computedTotal,
            payment_method,
            order_id: orderData.id,
            ...(customerPhone ? { customer_phone: customerPhone } : {}),
          },
          initiated_at: new Date().toISOString(),
        };

        // If payment_reference exists, try to link to existing transaction first
        if (payment_reference) {
          const { data: existingTransaction } = await supabaseAdmin
            .from('transactions')
            .select('id, metadata')
            .eq('transaction_reference', payment_reference)
            .or(`paystack_reference.eq.${payment_reference}`)
            .maybeSingle();

          if (existingTransaction) {
            // Update existing transaction with order_id and sync payment_status
            const existingMetadata = (existingTransaction as any).metadata || {};
            const orderPaymentStatus = orderData.payment_status || 'pending';
            
            await supabaseAdmin
              .from('transactions')
              .update({
                order_id: orderData.id,
                user_id: user_id || null,
                customer_email: customerEmail,
                payment_status: orderPaymentStatus, // Sync with order payment_status
                status: orderPaymentStatus === 'paid' ? 'success' : orderPaymentStatus === 'failed' ? 'failed' : 'pending',
                metadata: {
                  ...existingMetadata,
                  customer_name: customerName,
                  order_number: order_number,
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingTransaction.id);
            
            console.log('✅ Linked existing transaction to order:', orderData.order_number, 'with payment_status:', orderPaymentStatus);
          } else {
            // Create new transaction
            transactionData.paystack_reference = payment_reference;
            const { error: transactionError } = await supabaseAdmin
              .from('transactions')
              .insert([transactionData]);

            if (transactionError) {
              console.error('Error creating transaction:', transactionError);
            } else {
              console.log('✅ Created transaction for order:', orderData.order_number);
            }
          }
        } else {
          // Create transaction for cash on delivery or orders without payment reference
          const { error: transactionError } = await supabaseAdmin
            .from('transactions')
            .insert([transactionData]);

          if (transactionError) {
            console.error('Error creating transaction:', transactionError);
          } else {
            console.log('✅ Created transaction for order:', orderData.order_number);
          }
        }
      } catch (transactionError) {
        console.error('Error creating/linking transaction:', transactionError);
        // Don't fail order creation if transaction creation fails
      }

      // Determine customer email and name for order confirmation
      let customerEmail: string | null = null;
      let customerName: string = 'Customer';
      
      if (resolvedCustomer?.email) {
        customerEmail = resolvedCustomer.email;
        customerName = resolvedCustomer.full_name || customerName;
      } else if (userData?.email) {
        customerEmail = userData.email;
        customerName = userData.full_name || `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'Customer';
      } else if (shippingAddress && (shippingAddress as any)?.email) {
        // Guest checkout - get email from shipping address
        customerEmail = (shippingAddress as any).email;
        customerName = shippingAddress?.full_name || shippingAddress?.first_name || 'Guest Customer';
      }

      // Send order confirmation email to customer
      if (customerEmail) {
        try {
          console.log(`📧 Preparing to send order confirmation email to: ${customerEmail}`);
          const emailData = {
            ...orderData,
            user_id: user_id || null,
            customer_name: customerName,
            customer_email: customerEmail,
            items: orderItems,
            notes: orderData.notes || null,
            delivery_address: shippingAddress, // Keep for email template compatibility
          };

          const emailResult = await enhancedEmailService.sendOrderConfirmation(emailData);
          if (emailResult.skipped) {
            console.log(`⚠️ Order confirmation email skipped: ${emailResult.reason}`);
          } else if (emailResult.success) {
            console.log(`✅ Order confirmation email sent successfully to ${customerEmail}`);
          } else {
            console.error(`❌ Failed to send order confirmation email to ${customerEmail}:`, emailResult.reason);
          }
        } catch (emailError: any) {
          console.error('❌ Error sending order confirmation email:', {
            error: emailError,
            message: emailError?.message || 'Unknown error',
            customerEmail,
            orderNumber: orderData.order_number,
          });
          // Don't fail the request if email fails
        }
      } else {
        console.warn('⚠️ No email found for order confirmation. user_id:', user_id, 'shipping_address:', shippingAddress);
      }

      // Send admin notification email
      try {
        console.log('📧 Sending admin order notification email to support@hogtechgh.com');
        const emailData = {
          ...orderData,
          customer_name: resolvedCustomer?.full_name || userData?.full_name || shippingAddress?.full_name || 'Guest Customer',
          customer_email: resolvedCustomer?.email || userData?.email || (shippingAddress as any)?.email || 'No email',
          items: orderItems,
          notes: orderData.notes || null,
          delivery_address: shippingAddress, // Keep for email template compatibility
        };

        const adminEmailResult = await enhancedEmailService.sendAdminOrderNotification(emailData);
        if (adminEmailResult.success) {
          console.log('✅ Admin order notification email sent successfully to support@hogtechgh.com');
        } else {
          console.error('❌ Failed to send admin order notification email:', adminEmailResult.reason);
        }
      } catch (emailError: any) {
        console.error('❌ Error sending admin order notification email:', {
          error: emailError,
          message: emailError?.message || 'Unknown error',
          orderNumber: orderData.order_number,
        });
        // Don't fail the request if email fails
      }

      // Create admin notification in dashboard
      try {
        const notificationName = resolvedCustomer?.full_name || userData?.full_name || shippingAddress?.full_name || 'Guest Customer';

        const { error: notifError } = await supabaseAdmin
          .from('notifications')
          .insert([{
            type: 'order',
            title: `New Order: ${orderData.order_number}`,
            message: `New order received from ${notificationName}. Total: GHS ${orderData.total.toFixed(2)}`,
            is_read: false,
          }]);

        if (notifError) {
          console.error('Failed to create admin notification:', notifError);
        } else {
          console.log('Admin notification created successfully');
        }
      } catch (notifError) {
        console.error('Failed to create admin notification:', notifError);
        // Don't fail the request if notification fails
      }

      console.log('✅ Order creation completed successfully:', {
        order_id: orderData.id,
        order_number: orderData.order_number,
        total: orderData.total,
        email_sent: true, // Email is sent above
        stock_updated: true, // Stock is updated above
      });

      const responsePayload = {
        ...orderData,
        order_items: orderItems,
        shipping_address: shippingAddress,
        delivery_address: shippingAddress,
        contains_deal_items: hasStandaloneItems,
      };

      if (discountRecordId) {
        await commitDiscountUsage(discountRecordId).catch((error: unknown) => {
          console.error('⚠️ Failed to commit discount usage:', error);
        });
      }

      res.json({
        success: true,
        message: 'Order created successfully',
        data: responsePayload,
      });
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : (error?.message || 'Unknown error');
      const errorDetails = error?.details || error?.hint || null;
      const errorCode = error?.code || null;
      
      console.error('❌ Error creating order:', {
        error,
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        code: errorCode,
        details: errorDetails,
        hint: error?.hint,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
      });
      
      // Ensure we always send a proper JSON response
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Failed to create order',
          error: errorMessage,
          ...(errorDetails && { details: errorDetails }),
          ...(errorCode && { code: errorCode }),
        });
      } else {
        console.error('⚠️ Response already sent, cannot send error response');
      }
    }
  }

  // Send wishlist reminder
  async sendWishlistReminder(req: Request, res: Response) {
    try {
      const { user_id } = req.params;

      // Get user data
      const { data: userData, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, first_name, last_name, email')
        .eq('id', user_id)
        .single();

      if (userError) throw userError;

      // Get wishlist items
      const { data: wishlistData, error: wishlistError } = await supabaseAdmin
        .from('wishlists')
        .select(`
          *,
          product:products!wishlists_product_id_fkey(*)
        `)
        .eq('user_id', user_id);

      if (wishlistError) throw wishlistError;

      if (wishlistData && wishlistData.length > 0) {
        // Format wishlist items for email
        const wishlistItems = wishlistData.map((item: any) => ({
          product_name: item.product?.name || 'Unknown Product',
          product_description: item.product?.description || '',
          product_price: item.product?.discount_price || item.product?.price || 0,
        }));

        const emailResult = await enhancedEmailService.sendWishlistReminder(
          userData.id,
          wishlistItems
        );
        if (emailResult.skipped) {
          console.log(`Wishlist reminder email skipped: ${emailResult.reason}`);
        } else if (emailResult.success) {
          console.log('Wishlist reminder email sent successfully');
        } else {
          console.error('Failed to send wishlist reminder email:', emailResult.reason);
        }
      }

      res.json({
        success: true,
        message: 'Wishlist reminder sent successfully',
      });
    } catch (error) {
      console.error('Error sending wishlist reminder:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send wishlist reminder',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Send cart abandonment reminder
  async sendCartAbandonmentReminder(req: Request, res: Response) {
    try {
      const { user_id, cart_items } = req.body;

      // Get user data
      const { data: userData, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, first_name, last_name, email')
        .eq('id', user_id)
        .single();

      if (userError) throw userError;

      const emailResult = await enhancedEmailService.sendCartAbandonmentReminder(
        userData.id,
        cart_items || []
      );
      if (emailResult.skipped) {
        console.log(`Cart abandonment reminder email skipped: ${emailResult.reason}`);
      } else if (emailResult.success) {
        console.log('Cart abandonment reminder email sent successfully');
      } else {
        console.error('Failed to send cart abandonment reminder email:', emailResult.reason);
      }

      res.json({
        success: true,
        message: 'Cart abandonment reminder sent successfully',
      });
    } catch (error) {
      console.error('Error sending cart abandonment reminder:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send cart abandonment reminder',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Download order PDF
  async downloadOrderPDF(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      // Get order data with all related information
      let { data: orderData, error: orderError } = await supabaseAdmin
        .from('orders')
        .select(`
          *,
          user:users!orders_user_id_fkey(id, first_name, last_name, email),
          customer:customers!orders_customer_id_fkey(id, full_name, email, phone, source),
          order_items:order_items!order_items_order_id_fkey(*)
        `)
        .eq('id', id)
        .single();

      // If query fails or no items, try fetching separately
      if (orderError || !orderData) {
        // Try without explicit FK name
        const result = await supabaseAdmin
          .from('orders')
          .select(`
            *,
            user:users!orders_user_id_fkey(id, first_name, last_name, email),
            customer:customers!orders_customer_id_fkey(id, full_name, email, phone, source),
            order_items(*)
          `)
          .eq('id', id)
          .single();
        
        if (!result.error && result.data) {
          orderData = result.data;
          orderError = null;
        }
      }

      // If still no items, fetch separately
      if (!orderError && orderData && (!orderData.order_items || orderData.order_items.length === 0)) {
        console.log('No items found in order query, fetching separately...');
        const { data: itemsData, error: itemsError } = await supabaseAdmin
          .from('order_items')
          .select('*')
          .eq('order_id', id);
        
        if (!itemsError && itemsData) {
          console.log('Fetched items separately for PDF:', itemsData.length, 'items');
          orderData.order_items = itemsData;
        } else if (itemsError) {
          console.error('Error fetching items separately for PDF:', itemsError);
        }
      }

      if (orderError) throw orderError;

      const currentUser = req.user;
      const isAdminUser = currentUser?.role === 'admin';

      if (!isAdminUser) {
        if (!currentUser) {
          return res.status(401).json({
            success: false,
            message: 'Unauthorized',
          });
        }

        if (orderData.user_id !== currentUser.id) {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to this order PDF',
          });
        }
      }

      // Debug: Log order data before PDF generation
      console.log('Order data for PDF:', {
        orderId: id,
        hasOrderItems: !!orderData.order_items,
        orderItemsLength: orderData.order_items?.length || 0,
      });

      // Generate PDF
      const pdfBuffer = await pdfService.generateOrderPDF(orderData);

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="order-${orderData.order_number}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      // Send PDF
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error generating order PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate order PDF',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}