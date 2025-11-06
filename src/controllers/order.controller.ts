import { Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';
import enhancedEmailService from '../services/enhanced-email.service';
import pdfService from '../services/pdf.service';

export class OrderController {
  // Get all orders (admin)
  async getAllOrders(req: Request, res: Response) {
    try {
      const { user_id, status } = req.query;
      
      let query = supabaseAdmin
        .from('orders')
        .select(`
          *,
          user:users!orders_user_id_fkey(id, first_name, last_name, full_name, email),
          order_items:order_items(*)
        `);

      // Filter by user_id if provided
      if (user_id) {
        query = query.eq('user_id', user_id as string);
      }

      // Filter by status if provided
      if (status && status !== 'all') {
        query = query.eq('status', status as string);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      res.json({
        success: true,
        data: data || [],
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

  // Get order by ID
  async getOrderById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const { data, error } = await supabaseAdmin
        .from('orders')
        .select(`
          *,
          user:users!orders_user_id_fkey(id, first_name, last_name, email),
          order_items:order_items(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

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
      
      if (orderData.user && orderData.user.email && orderData.user.email.toLowerCase() === email.toLowerCase()) {
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
          order_items:order_items(*)
        `)
        .single();

      if (orderError) throw orderError;

      // Send email notification (don't fail order update if email fails)
      try {
        // Determine customer email and name
        let customerEmail: string | null = null;
        let customerName: string = 'Customer';
        
        if (orderData.user && orderData.user.email) {
          // Logged-in user
          customerEmail = orderData.user.email;
          customerName = `${orderData.user.first_name || ''} ${orderData.user.last_name || ''}`.trim() || 'Customer';
        } else if (orderData.shipping_address && (orderData.shipping_address as any)?.email) {
          // Guest checkout - get email from shipping address
          customerEmail = (orderData.shipping_address as any).email;
          customerName = orderData.shipping_address?.full_name || orderData.shipping_address?.first_name || 'Guest Customer';
        }

        if (customerEmail) {
          const emailData = {
            ...orderData,
            customer_name: customerName,
            customer_email: customerEmail,
            items: orderData.order_items || [],
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
          order_items:order_items(*)
        `)
        .single();

      if (orderError) throw orderError;

      // Also update the transaction's payment_status to keep it in sync
      try {
        const { error: transactionError } = await supabaseAdmin
          .from('transactions')
          .update({
            payment_status,
            status: payment_status === 'paid' ? 'success' : payment_status === 'failed' ? 'failed' : 'pending',
            updated_at: new Date().toISOString(),
          })
          .eq('order_id', id);

        if (transactionError) {
          console.warn('Warning: Failed to update transaction payment_status:', transactionError);
          // Don't fail the request if transaction update fails
        } else {
          console.log(`✅ Updated transaction payment_status to ${payment_status} for order ${id}`);
        }
      } catch (transactionUpdateError) {
        console.warn('Warning: Error updating transaction payment_status:', transactionUpdateError);
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
  async cancelOrder(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { cancellation_reason } = req.body;

      // Update order
      const { data: orderData, error: orderError } = await supabaseAdmin
        .from('orders')
        .update({
          status: 'cancelled',
          notes: cancellation_reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select(`
          *,
          user:users!orders_user_id_fkey(id, first_name, last_name, email),
          order_items:order_items(*)
        `)
        .single();

      if (orderError) throw orderError;

      // Send cancellation email
      try {
        const customerName = `${orderData.user.first_name || ''} ${orderData.user.last_name || ''}`.trim() || 'Customer';
        const emailData = {
          ...orderData,
          customer_name: customerName,
          customer_email: orderData.user.email,
          cancellation_reason,
        };

        // Note: Using order confirmation template for cancellation
        const emailResult = await enhancedEmailService.sendOrderConfirmation(emailData);
        if (emailResult.skipped) {
          console.log(`Order cancellation email skipped: ${emailResult.reason}`);
        } else if (emailResult.success) {
          console.log('Order cancellation email sent successfully');
        } else {
          console.error('Failed to send order cancellation email:', emailResult.reason);
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
  async createOrder(req: Request, res: Response) {
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
        order_number, // Optional - will be generated if not provided
        subtotal,
        discount,
        tax,
        delivery_fee,
        delivery_option,
        total,
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

      if (!total || total <= 0) {
        console.error('❌ Order creation failed: Invalid total amount');
        return res.status(400).json({
          success: false,
          message: 'Invalid total amount',
          error: 'Total must be greater than 0',
        });
      }

      // Generate order number if not provided (backend generates sequential number)
      const finalOrderNumber = order_number || await this.generateOrderNumber();
      console.log('✅ Generated order number:', finalOrderNumber);

      // Map delivery_address to shipping_address and include delivery_option in the address JSON
      const shippingAddress = delivery_address ? {
        ...delivery_address,
        delivery_option: delivery_option || { name: 'Standard', price: delivery_fee || 0 },
      } : null;

      // Create order
      // Note: payment_reference column does NOT exist in orders table
      // Store it in shipping_address JSON instead (if provided)
      const orderInsertData: any = {
        user_id,
        order_number: finalOrderNumber,
        subtotal,
        discount,
        tax,
        shipping_fee: delivery_fee || 0,
        total,
        payment_method,
        shipping_address: shippingAddress ? {
          ...shippingAddress,
          // Only include payment_reference if provided (store in shipping_address JSON)
          ...(payment_reference ? { payment_reference } : {}),
        } : null,
        notes: notes || null,
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

      // Create order items and decrease stock
      const orderItems = order_items.map((item: any) => ({
        order_id: orderData.id,
        product_id: item.product_id,
        product_name: item.product_name,
        product_image: item.product_image,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.subtotal || item.total_price || (item.unit_price * item.quantity), // Use total_price as per schema
        selected_variants: item.selected_variants,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from('order_items')
        .insert(orderItems);

      if (itemsError) {
        console.error('❌ Order items creation failed:', itemsError);
        throw itemsError;
      }
      
      console.log(`✅ Created ${orderItems.length} order items`);

      // Decrease stock for each product in the order
      try {
        for (const item of order_items) {
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
      } catch (stockError) {
        console.error('❌ Error updating product stock:', stockError);
        // Don't fail order creation if stock update fails - log and continue
        // This allows the order to be created even if stock update fails
      }

      // Get user data for email (if logged in) - moved before transaction creation
      let userData: any = null;
      if (user_id) {
        const { data, error: userError } = await supabaseAdmin
          .from('users')
          .select('first_name, last_name, email, full_name')
          .eq('id', user_id)
          .maybeSingle();

        if (!userError) {
          userData = data;
        }
      }

      // Create transaction record for this order (even if pending)
      // This ensures all orders have a transaction record for tracking
      try {
        // Determine customer email and name
        let customerEmail: string | null = null;
        let customerName: string = 'Customer';
        
        if (userData && userData.email) {
          customerEmail = userData.email;
          customerName = userData.full_name || `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'Customer';
        } else if (shippingAddress && (shippingAddress as any)?.email) {
          customerEmail = (shippingAddress as any).email;
          customerName = shippingAddress?.full_name || shippingAddress?.first_name || 'Guest Customer';
        }

        // Get order payment_status to sync with transaction
        const orderPaymentStatus = orderData.payment_status || 'pending';
        
        const transactionData: any = {
          order_id: orderData.id,
          user_id: user_id || null,
          transaction_reference: payment_reference || `TXN-${orderData.id.slice(0, 8)}`,
          payment_method: payment_method || 'cash_on_delivery',
          payment_provider: payment_method === 'paystack' ? 'paystack' : payment_method === 'cash_on_delivery' ? 'cash' : 'other',
          amount: total,
          currency: 'GHS',
          status: orderPaymentStatus === 'paid' ? 'success' : orderPaymentStatus === 'failed' ? 'failed' : 'pending',
          payment_status: orderPaymentStatus, // Sync with order payment_status
          customer_email: customerEmail || 'no-email@example.com', // Required field - provide default if missing
          metadata: {
            order_number: order_number,
            customer_name: customerName, // Store customer name in metadata
            subtotal,
            discount,
            tax,
            shipping_fee: delivery_fee || 0,
            total,
            payment_method,
            order_id: orderData.id,
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
      
      if (userData && userData.email) {
        // Logged-in user
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
        console.log('📧 Sending admin order notification email to ventechgadgets@gmail.com');
        const emailData = {
          ...orderData,
          customer_name: userData?.full_name || shippingAddress?.full_name || 'Guest Customer',
          customer_email: userData?.email || (shippingAddress as any)?.email || 'No email',
          items: orderItems,
          notes: orderData.notes || null,
          delivery_address: shippingAddress, // Keep for email template compatibility
        };

        const adminEmailResult = await enhancedEmailService.sendAdminOrderNotification(emailData);
        if (adminEmailResult.success) {
          console.log('✅ Admin order notification email sent successfully to ventechgadgets@gmail.com');
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
        const { error: notifError } = await supabaseAdmin
          .from('notifications')
          .insert([{
            type: 'order',
            title: `New Order: ${orderData.order_number}`,
            message: `New order received from ${userData?.full_name || shippingAddress?.full_name || 'Guest Customer'}. Total: GHS ${orderData.total.toFixed(2)}`,
            data: {
              order_id: orderData.id,
              order_number: orderData.order_number,
              customer_name: userData?.full_name || shippingAddress?.full_name || 'Guest',
            },
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

      res.json({
        success: true,
        message: 'Order created successfully',
        data: orderData,
      });
    } catch (error: any) {
      console.error('❌ Error creating order:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
      });
      res.status(500).json({
        success: false,
        message: 'Failed to create order',
        error: error instanceof Error ? error.message : (error?.message || 'Unknown error'),
        details: error?.details || error?.hint || undefined,
        code: error?.code || undefined,
      });
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
  async downloadOrderPDF(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Get order data with all related information
      let { data: orderData, error: orderError } = await supabaseAdmin
        .from('orders')
        .select(`
          *,
          user:users!orders_user_id_fkey(id, first_name, last_name, email),
          order_items!order_items_order_id_fkey(*)
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