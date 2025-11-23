import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { supabaseAdmin } from '../utils/supabaseClient';
import enhancedEmailService from '../services/enhanced-email.service';

export class ReturnRequestController {
  // Create a return request (user)
  async createReturnRequest(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { order_number, reason, photos = [] } = req.body;

      if (!order_number || !reason) {
        return res.status(400).json({
          success: false,
          message: 'Order number and reason are required',
        });
      }

      // Verify order exists and belongs to user (if logged in)
      // Trim and normalize order number (case-insensitive, remove extra spaces)
      const normalizedOrderNumber = order_number.trim().toUpperCase();
      const trimmedOrderNumber = order_number.trim();
      
      // Try multiple lookup strategies
      let order: any = null;
      let realError: any = null; // Only track actual database errors, not "not found"

      // Helper to check if error is "not found" (expected) vs real error
      const isNotFoundError = (error: any) => {
        if (!error) return false;
        const code = error.code;
        const message = error.message || '';
        // These are "not found" errors, not real errors
        return code === 'PGRST116' || 
               code === '42P01' || 
               message.includes('No rows') ||
               message.includes('not found');
      };

      // Strategy 1: Case-insensitive match (ilike) - fetch order first, then items separately
      try {
        const ilikeQuery = await supabaseAdmin
          .from('orders')
          .select('id, order_number, user_id, status, total, created_at')
          .ilike('order_number', normalizedOrderNumber)
          .maybeSingle();
        
        if (!ilikeQuery.error && ilikeQuery.data) {
          order = ilikeQuery.data;
          
          // Fetch order items separately
          const { data: items, error: itemsError } = await supabaseAdmin
            .from('order_items')
            .select('id, product_name, quantity, unit_price, total_price, product_image, selected_variants')
            .eq('order_id', order.id);
          
          if (!itemsError && items) {
            order.order_items = items;
          }
          
          console.log('✅ Order found via ilike query:', {
            orderNumber: order.order_number,
            status: order.status,
            hasItems: order.order_items?.length > 0,
          });
        } else if (ilikeQuery.error && !isNotFoundError(ilikeQuery.error)) {
          // Only track real errors, not "not found"
          realError = ilikeQuery.error;
          console.error('❌ ilike query error:', {
            error: ilikeQuery.error,
            code: ilikeQuery.error?.code,
            message: ilikeQuery.error?.message,
            details: ilikeQuery.error?.details,
            hint: ilikeQuery.error?.hint,
          });
        } else if (ilikeQuery.error) {
          console.log('ℹ️ Order not found via ilike (expected if order doesn\'t exist):', {
            code: ilikeQuery.error?.code,
            message: ilikeQuery.error?.message,
          });
        }
        
        if (!ilikeQuery.error && ilikeQuery.data) {
          order = ilikeQuery.data;
          console.log('✅ Order found via ilike query:', {
            orderNumber: order.order_number,
            status: order.status,
            hasItems: order.order_items?.length > 0,
          });
        } else if (ilikeQuery.error && !isNotFoundError(ilikeQuery.error)) {
          // Only track real errors, not "not found"
          realError = ilikeQuery.error;
          console.error('❌ ilike query error:', {
            error: ilikeQuery.error,
            code: ilikeQuery.error?.code,
            message: ilikeQuery.error?.message,
            details: ilikeQuery.error?.details,
            hint: ilikeQuery.error?.hint,
          });
        } else if (ilikeQuery.error) {
          console.log('ℹ️ Order not found via ilike (expected if order doesn\'t exist):', {
            code: ilikeQuery.error?.code,
            message: ilikeQuery.error?.message,
          });
        }
      } catch (err: any) {
        console.error('Exception in ilike query:', err);
        if (!realError) {
          realError = err;
        }
      }

      // Strategy 2: Exact match with normalized (uppercase) - fetch order first, then items separately
      if (!order) {
        try {
          const exactQuery = await supabaseAdmin
            .from('orders')
            .select('id, order_number, user_id, status, total, created_at')
            .eq('order_number', normalizedOrderNumber)
            .maybeSingle();
          
          if (!exactQuery.error && exactQuery.data) {
            order = exactQuery.data;
            
            // Fetch order items separately
            const { data: items, error: itemsError } = await supabaseAdmin
              .from('order_items')
              .select('id, product_name, quantity, unit_price, total_price, product_image, selected_variants')
              .eq('order_id', order.id);
            
            if (!itemsError && items) {
              order.order_items = items;
            }
            
            console.log('✅ Order found via exact query:', {
              orderNumber: order.order_number,
              status: order.status,
              hasItems: order.order_items?.length > 0,
            });
          } else if (exactQuery.error && !isNotFoundError(exactQuery.error) && !realError) {
            realError = exactQuery.error;
            console.error('❌ exact query error:', {
              error: exactQuery.error,
              code: exactQuery.error?.code,
              message: exactQuery.error?.message,
            });
          }
        } catch (err: any) {
          console.error('Exception in exact query:', err);
          if (!realError) {
            realError = err;
          }
        }
      }

      // Strategy 3: Exact match with original (as-is) - fetch order first, then items separately
      if (!order) {
        try {
          const originalQuery = await supabaseAdmin
            .from('orders')
            .select('id, order_number, user_id, status, total, created_at')
            .eq('order_number', trimmedOrderNumber)
            .maybeSingle();
          
          if (!originalQuery.error && originalQuery.data) {
            order = originalQuery.data;
            
            // Fetch order items separately
            const { data: items, error: itemsError } = await supabaseAdmin
              .from('order_items')
              .select('id, product_name, quantity, unit_price, total_price, product_image, selected_variants')
              .eq('order_id', order.id);
            
            if (!itemsError && items) {
              order.order_items = items;
            }
            
            console.log('✅ Order found via original query:', {
              orderNumber: order.order_number,
              status: order.status,
              hasItems: order.order_items?.length > 0,
            });
          } else if (originalQuery.error && !isNotFoundError(originalQuery.error) && !realError) {
            realError = originalQuery.error;
            console.error('❌ original query error:', {
              error: originalQuery.error,
              code: originalQuery.error?.code,
              message: originalQuery.error?.message,
            });
          }
        } catch (err: any) {
          console.error('Exception in original query:', err);
          if (!realError) {
            realError = err;
          }
        }
      }

      // If we have a real database error and no order, return error
      if (realError && !order) {
        console.error('Database error looking up order:', {
          error: realError,
          code: realError.code,
          message: realError.message,
          details: realError.details,
          hint: realError.hint,
          orderNumber: order_number,
          normalized: normalizedOrderNumber,
        });
        return res.status(500).json({
          success: false,
          message: 'Error looking up order. Please try again.',
          error: realError.message || 'Database error',
          details: process.env.NODE_ENV === 'development' ? {
            code: realError.code,
            details: realError.details,
            hint: realError.hint,
          } : undefined,
        });
      }

      // If no order found after all strategies (but no real errors)
      if (!order) {
        console.log('Order lookup failed - tried all strategies:', {
          normalized: normalizedOrderNumber,
          trimmed: trimmedOrderNumber,
          original: order_number,
        });
        return res.status(404).json({
          success: false,
          message: `Order not found: ${order_number}. Please check your order number and try again.`,
        });
      }

      // Optional: Check if order status allows returns (business logic)
      // Typically, returns are only allowed for delivered orders, but we can be flexible
      // You can uncomment this if you want to restrict returns to delivered orders only
      /*
      const allowedStatusesForReturn = ['delivered'];
      if (!allowedStatusesForReturn.includes(order.status)) {
        return res.status(400).json({
          success: false,
          message: `Returns are only allowed for delivered orders. Your order status is: ${order.status}.`,
        });
      }
      */

      // If user is logged in, verify order belongs to them
      if (userId && order.user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'This order does not belong to you.',
        });
      }

      // Log order details for debugging
      console.log('📦 Order details for return request:', {
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
        total: order.total,
        itemsCount: order.order_items?.length || 0,
        userId: order.user_id,
        requestedBy: userId || 'guest',
      });

      // Optional: Check if order status allows returns
      // Typically, returns are only allowed for delivered orders
      // But we allow all statuses for flexibility (you can restrict this if needed)
      const allowedStatusesForReturn = ['delivered', 'shipped', 'processing', 'pending'];
      if (!allowedStatusesForReturn.includes(order.status)) {
        console.warn('⚠️ Return request for order with status:', order.status);
        // Still allow it, but log a warning
        // Uncomment the return below if you want to restrict returns to delivered orders only
        /*
        return res.status(400).json({
          success: false,
          message: `Returns are typically only allowed for delivered orders. Your order status is: ${order.status}. Please contact customer service if you need to return an order with this status.`,
        });
        */
      }

      // Use the actual order_number from the database (in case of case differences)
      const actualOrderNumber = order.order_number;

      // Check if return request already exists for this order
      const { data: existingRequest } = await supabaseAdmin
        .from('return_requests')
        .select('id, status')
        .ilike('order_number', actualOrderNumber) // Case-insensitive match
        .eq('status', 'pending')
        .maybeSingle();

      if (existingRequest) {
        return res.status(400).json({
          success: false,
          message: 'A pending return request already exists for this order.',
        });
      }

      // Create return request (use actual order_number from database)
      const { data: returnRequest, error: createError } = await supabaseAdmin
        .from('return_requests')
        .insert({
          user_id: userId || null,
          order_number: actualOrderNumber, // Use actual order number from DB
          order_id: order.id,
          reason,
          photos: Array.isArray(photos) ? photos : [],
          status: 'pending',
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating return request:', createError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create return request',
          error: createError.message,
        });
      }

      // Get customer email and name for emails
      let customerEmail: string | null = null;
      let customerName: string | undefined = undefined;
      
      if (userId && req.user) {
        customerEmail = req.user.email || null;
        customerName = req.user.full_name || 
                      (req.user.first_name && req.user.last_name 
                        ? `${req.user.first_name} ${req.user.last_name}` 
                        : undefined);
      } else {
        // For guest customers, try to get email from order's shipping address
        try {
          const { data: orderWithAddress } = await supabaseAdmin
            .from('orders')
            .select('shipping_address')
            .eq('id', order.id)
            .single();
          
          if (orderWithAddress?.shipping_address?.email) {
            customerEmail = orderWithAddress.shipping_address.email;
            customerName = orderWithAddress.shipping_address.name || 
                          orderWithAddress.shipping_address.full_name;
          }
        } catch (err) {
          console.warn('Could not fetch customer email from order:', err);
        }
      }

      // Send confirmation email to customer (if email available)
      if (customerEmail) {
        try {
          await enhancedEmailService.sendReturnRequestConfirmationEmail({
            returnRequestId: returnRequest.id,
            orderNumber: actualOrderNumber,
            reason,
            customerEmail,
            customerName,
            orderItems: order.order_items || [],
            orderTotal: order.total,
            orderDate: order.created_at,
          });
        } catch (emailError) {
          console.error('Error sending customer return confirmation email:', emailError);
          // Don't fail the request if email fails
        }
      }

      // Send notification email to admin
      try {
        await enhancedEmailService.sendAdminReturnRequestNotification({
          returnRequestId: returnRequest.id,
          orderNumber: actualOrderNumber,
          reason,
          customerEmail,
        });
      } catch (emailError) {
        console.error('Error sending admin notification email:', emailError);
        // Don't fail the request if email fails
      }

      return res.status(201).json({
        success: true,
        message: 'Return request submitted successfully. Our team will review it shortly.',
        data: returnRequest,
      });
    } catch (error: any) {
      console.error('Error creating return request:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message,
      });
    }
  }

  // Get return requests (user - their own, admin - all)
  async getReturnRequests(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      const { status, order_number } = req.query;

      let query = supabaseAdmin
        .from('return_requests')
        .select(`
          *,
          user:users!return_requests_user_id_fkey(id, first_name, last_name, full_name, email),
          order:orders!return_requests_order_id_fkey(id, order_number, status, total)
        `)
        .order('created_at', { ascending: false });

      // Users can only see their own requests
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        if (!userId) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required',
          });
        }
        query = query.eq('user_id', userId);
      }

      // Filter by status
      if (status && status !== 'all') {
        query = query.eq('status', status as string);
      }

      // Filter by order number
      if (order_number) {
        query = query.eq('order_number', order_number as string);
      }

      const { data: returnRequests, error } = await query;

      if (error) {
        console.error('Error fetching return requests:', error);
        
        // Handle case where table doesn't exist yet
        const errorCode = (error as any).code;
        if (errorCode === 'PGRST116' || errorCode === '42P01' || error.message?.includes('does not exist')) {
          console.warn('Return requests table does not exist yet. Please run the migration: create_return_requests_table.sql');
          return res.status(200).json({
            success: true,
            data: [],
            message: 'Return requests table not found. Please run the database migration.',
          });
        }
        
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch return requests',
          error: error.message,
        });
      }

      return res.status(200).json({
        success: true,
        data: returnRequests || [],
      });
    } catch (error: any) {
      console.error('Error fetching return requests:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message,
      });
    }
  }

  // Get single return request
  async getReturnRequestById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const userRole = req.user?.role;

      const { data: returnRequest, error } = await supabaseAdmin
        .from('return_requests')
        .select(`
          *,
          user:users!return_requests_user_id_fkey(id, first_name, last_name, full_name, email),
          order:orders!return_requests_order_id_fkey(
            id,
            order_number,
            status,
            total,
            order_items(*)
          )
        `)
        .eq('id', id)
        .single();

      if (error || !returnRequest) {
        return res.status(404).json({
          success: false,
          message: 'Return request not found',
        });
      }

      // Users can only see their own requests
      if (userRole !== 'admin' && userRole !== 'superadmin') {
        if (!userId || returnRequest.user_id !== userId) {
          return res.status(403).json({
            success: false,
            message: 'Access denied',
          });
        }
      }

      return res.status(200).json({
        success: true,
        data: returnRequest,
      });
    } catch (error: any) {
      console.error('Error fetching return request:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message,
      });
    }
  }

  // Update return request status (admin only)
  async updateReturnRequestStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status, admin_notes, rejection_reason, return_address } = req.body;
      const userRole = req.user?.role;

      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Admin access required',
        });
      }

      if (!status || !['pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Valid status is required',
        });
      }

      // Get current return request with order details
      const { data: currentRequest, error: fetchError } = await supabaseAdmin
        .from('return_requests')
        .select(`
          *,
          user:users!return_requests_user_id_fkey(id, first_name, last_name, full_name, email),
          order:orders!return_requests_order_id_fkey(
            id,
            order_number,
            status,
            total,
            created_at
          )
        `)
        .eq('id', id)
        .single();
      
      // Fetch order items separately to avoid relationship query issues
      if (currentRequest && !fetchError && currentRequest.order) {
        const { data: orderItems } = await supabaseAdmin
          .from('order_items')
          .select('id, product_name, quantity, unit_price, total_price, product_image, selected_variants')
          .eq('order_id', currentRequest.order.id);
        
        if (orderItems) {
          currentRequest.order.order_items = orderItems;
        }
      }

      if (fetchError || !currentRequest) {
        return res.status(404).json({
          success: false,
          message: 'Return request not found',
        });
      }

      // Generate RA number when approving
      let returnAuthorizationNumber = currentRequest.return_authorization_number;
      let approvedAt = currentRequest.approved_at;

      if (status === 'approved' && !returnAuthorizationNumber) {
        // Generate RA number using the database function
        const { data: raData, error: raError } = await supabaseAdmin.rpc('generate_ra_number');
        
        if (raError) {
          // Fallback: generate manually if function doesn't exist
          const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const randomPart = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
          returnAuthorizationNumber = `RA-${datePart}-${randomPart}`;
        } else {
          returnAuthorizationNumber = raData;
        }

        approvedAt = new Date().toISOString();
      }

      // Update return request
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (admin_notes !== undefined) updateData.admin_notes = admin_notes;
      if (rejection_reason !== undefined) updateData.rejection_reason = rejection_reason;
      if (return_address !== undefined) updateData.return_address = return_address;
      if (returnAuthorizationNumber) updateData.return_authorization_number = returnAuthorizationNumber;
      if (approvedAt) updateData.approved_at = approvedAt;
      if (status === 'completed') updateData.completed_at = new Date().toISOString();

      const { data: updatedRequest, error: updateError } = await supabaseAdmin
        .from('return_requests')
        .update(updateData)
        .eq('id', id)
        .select(`
          *,
          user:users!return_requests_user_id_fkey(id, first_name, last_name, full_name, email),
          order:orders!return_requests_order_id_fkey(
            id,
            order_number,
            status,
            total,
            created_at
          )
        `)
        .single();
      
      // Fetch order items separately to avoid relationship query issues (error 42703)
      if (updatedRequest && !updateError && updatedRequest.order) {
        const { data: orderItems } = await supabaseAdmin
          .from('order_items')
          .select('id, product_name, quantity, unit_price, total_price, product_image, selected_variants')
          .eq('order_id', updatedRequest.order.id);
        
        if (orderItems) {
          updatedRequest.order.order_items = orderItems;
        }
      }

      if (updateError) {
        console.error('Error updating return request:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Failed to update return request',
          error: updateError.message,
        });
      }

      // Get customer email and name for emails
      let customerEmail: string | null = null;
      let customerName: string | undefined = undefined;
      
      if (updatedRequest.user) {
        customerEmail = updatedRequest.user.email || null;
        customerName = updatedRequest.user.full_name || 
                      (updatedRequest.user.first_name && updatedRequest.user.last_name 
                        ? `${updatedRequest.user.first_name} ${updatedRequest.user.last_name}` 
                        : undefined);
      } else {
        // For guest customers, try to get email from order's shipping address
        try {
          const { data: orderWithAddress } = await supabaseAdmin
            .from('orders')
            .select('shipping_address')
            .eq('id', currentRequest.order_id)
            .single();
          
          if (orderWithAddress?.shipping_address?.email) {
            customerEmail = orderWithAddress.shipping_address.email;
            customerName = orderWithAddress.shipping_address.name || 
                          orderWithAddress.shipping_address.full_name;
          }
        } catch (err) {
          console.warn('Could not fetch customer email from order:', err);
        }
      }

      // Send email notification to customer based on status
      try {
        const order = updatedRequest.order || currentRequest.order;
        const orderItems = order?.order_items || [];

        if (status === 'approved' && customerEmail) {
          await enhancedEmailService.sendReturnAuthorizationEmail({
            returnRequestId: updatedRequest.id,
            raNumber: returnAuthorizationNumber!,
            orderNumber: updatedRequest.order_number,
            returnAddress: return_address || 'Z236 Weija-Oblogo Rd, Accra, Ghana',
            customerEmail,
            customerName,
            orderItems,
            orderTotal: order?.total,
            orderDate: order?.created_at,
          });
        } else if (status === 'rejected' && customerEmail) {
          await enhancedEmailService.sendReturnRejectionEmail({
            returnRequestId: updatedRequest.id,
            orderNumber: updatedRequest.order_number,
            rejectionReason: rejection_reason || 'Return request does not meet our return policy requirements.',
            customerEmail,
            customerName,
            orderItems,
            orderTotal: order?.total,
            orderDate: order?.created_at,
          });
        } else if (['processing', 'completed', 'cancelled'].includes(status) && customerEmail) {
          // Send status update email for other status changes
          await enhancedEmailService.sendReturnStatusUpdateEmail({
            returnRequestId: updatedRequest.id,
            orderNumber: updatedRequest.order_number,
            status,
            raNumber: returnAuthorizationNumber || null,
            customerEmail,
            customerName,
            orderItems,
            orderTotal: order?.total,
            orderDate: order?.created_at,
            adminNotes: admin_notes || null,
          });
        }
      } catch (emailError) {
        console.error('Error sending customer notification email:', emailError);
        // Don't fail the request if email fails
      }

      return res.status(200).json({
        success: true,
        message: 'Return request updated successfully',
        data: updatedRequest,
      });
    } catch (error: any) {
      console.error('Error updating return request:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message,
      });
    }
  }

  // Delete return request (admin only)
  async deleteReturnRequest(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userRole = req.user?.role;

      if (userRole !== 'admin' && userRole !== 'superadmin') {
        return res.status(403).json({
          success: false,
          message: 'Admin access required',
        });
      }

      const { error } = await supabaseAdmin
        .from('return_requests')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting return request:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to delete return request',
          error: error.message,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Return request deleted successfully',
      });
    } catch (error: any) {
      console.error('Error deleting return request:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message,
      });
    }
  }
}

