import { Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabaseClient';
import enhancedEmailService from '../services/enhanced-email.service';
import pdfService from '../services/pdf.service';

export class OrderController {
  // Get all orders (admin)
  async getAllOrders(req: Request, res: Response) {
    try {
      const { user_id } = req.query;
      
      let query = supabaseAdmin
        .from('orders')
        .select(`
          *,
          user:users!orders_user_id_fkey(id, first_name, last_name, email),
          order_items:order_items(*)
        `);

      // Filter by user_id if provided
      if (user_id) {
        query = query.eq('user_id', user_id as string);
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

      // Send email notification
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
      } catch (emailError) {
        console.error('Failed to send order status update email:', emailError);
        // Don't fail the request if email fails
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

  // Create order (with email confirmation)
  async createOrder(req: Request, res: Response) {
    try {
      const {
        user_id,
        order_number,
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

      // Map delivery_address to shipping_address and include delivery_option in the address JSON
      const shippingAddress = delivery_address ? {
        ...delivery_address,
        delivery_option: delivery_option || { name: 'Standard', price: delivery_fee || 0 },
      } : null;

      // Create order
      const { data: orderData, error: orderError } = await supabaseAdmin
        .from('orders')
        .insert([{
          user_id,
          order_number,
          subtotal,
          discount,
          tax,
          shipping_fee: delivery_fee || 0,
          total,
          payment_method,
          shipping_address: shippingAddress,
          notes: notes || null,
          payment_reference: payment_reference || null,
          status: 'pending',
          payment_status: payment_method === 'cash_on_delivery' ? 'pending' : 'pending', // Will be updated when payment verified
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
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

      if (itemsError) throw itemsError;

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

        const transactionData: any = {
          order_id: orderData.id,
          user_id: user_id || null,
          transaction_reference: payment_reference || `TXN-${orderData.id.slice(0, 8)}`,
          payment_method: payment_method || 'cash_on_delivery',
          payment_provider: payment_method === 'paystack' ? 'paystack' : payment_method === 'cash_on_delivery' ? 'cash' : 'other',
          amount: total,
          currency: 'GHS',
          status: payment_method === 'cash_on_delivery' ? 'pending' : 'pending', // Will be updated when payment verified
          payment_status: payment_method === 'cash_on_delivery' ? 'pending' : 'pending', // Will be updated when payment verified
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
            // Update existing transaction with order_id
            const existingMetadata = (existingTransaction as any).metadata || {};
            await supabaseAdmin
              .from('transactions')
              .update({
                order_id: orderData.id,
                user_id: user_id || null,
                customer_email: customerEmail,
                metadata: {
                  ...existingMetadata,
                  customer_name: customerName,
                  order_number: order_number,
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingTransaction.id);
            
            console.log('✅ Linked existing transaction to order:', orderData.order_number);
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
          const emailData = {
            ...orderData,
            customer_name: customerName,
            customer_email: customerEmail,
            items: orderItems,
            notes: orderData.notes || null,
            delivery_address: shippingAddress, // Keep for email template compatibility
          };

          const emailResult = await enhancedEmailService.sendOrderConfirmation(emailData);
          if (emailResult.skipped) {
            console.log(`Order confirmation email skipped: ${emailResult.reason}`);
          } else if (emailResult.success) {
            console.log('Order confirmation email sent successfully to', customerEmail);
          } else {
            console.error('Failed to send order confirmation email:', emailResult.reason);
          }
        } catch (emailError) {
          console.error('Failed to send order confirmation email:', emailError);
          // Don't fail the request if email fails
        }
      } else {
        console.warn('No email found for order confirmation. user_id:', user_id, 'shipping_address:', shippingAddress);
      }

      // Send admin notification email
      try {
        const adminEmail = 'ventechgadget@gmail.com';
        const emailData = {
          ...orderData,
          customer_name: userData?.full_name || shippingAddress?.full_name || 'Guest Customer',
          customer_email: userData?.email || (shippingAddress as any)?.email || 'No email',
          items: orderItems,
          notes: orderData.notes || null,
          delivery_address: shippingAddress, // Keep for email template compatibility
        };

        await enhancedEmailService.sendAdminOrderNotification(emailData);
        console.log('Admin order notification email sent successfully');
      } catch (emailError) {
        console.error('Failed to send admin order notification email:', emailError);
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

      res.json({
        success: true,
        message: 'Order created successfully',
        data: orderData,
      });
    } catch (error) {
      console.error('Error creating order:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create order',
        error: error instanceof Error ? error.message : 'Unknown error',
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