import { Response } from 'express';
import { randomUUID } from 'crypto';
import { AuthRequest } from '../middleware/auth.middleware';
import { successResponse, errorResponse } from '../utils/responseHandlers';
import { customerService } from '../services/customer.service';
import { supabaseAdmin } from '../utils/supabaseClient';

const resolveFallbackEmail = (): { primary: string; alias: string } => {
  const fallback = process.env.ADMIN_FALLBACK_EMAIL || process.env.SUPPORT_EMAIL || 'support@hogtechgh.com';
  const [localPart, domain] = fallback.split('@');

  if (!localPart || !domain) {
    return {
      primary: 'support@hogtechgh.com',
      alias: `support+${randomUUID().slice(0, 8)}@hogtechgh.com`,
    };
  }

  const sanitizedLocal = localPart.replace(/[^a-zA-Z0-9.+_-]/g, '');
  const alias = `${sanitizedLocal}+${randomUUID().slice(0, 8)}@${domain}`;
  return {
    primary: fallback,
    alias,
  };
};

export class CustomerController {
  async listCustomers(req: AuthRequest, res: Response) {
    try {
      const searchTerm = typeof req.query.q === 'string' ? req.query.q.trim() : '';

      let query = supabaseAdmin
        .from('customers')
        .select(`
          id,
          user_id,
          full_name,
          email,
          phone,
          source,
          created_at,
          last_order_at,
          user:users!customers_user_id_fkey(
            id,
            full_name,
            first_name,
            last_name,
            email,
            phone,
            newsletter_subscribed,
            created_at
          )
        `)
        .order('created_at', { ascending: false });

      if (searchTerm) {
        query = query.or(
          ['full_name', 'email', 'phone']
            .map((column) => `${column}.ilike.%${searchTerm}%`)
            .join(',')
        );
      }

      const { data, error } = await query;

      if (error) throw error;

      return successResponse(res, data || [], 'Customers fetched successfully');
    } catch (error: any) {
      console.error('Error listing customers:', error);
      return errorResponse(res, error?.message || 'Failed to fetch customers', 500);
    }
  }

  async linkCustomerToUser(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id || req.body?.user_id;
      const emailFromPayload = typeof req.body?.email === 'string' ? req.body.email : req.user?.email;
      const normalizedEmail = emailFromPayload?.trim().toLowerCase();

      if (!userId || !normalizedEmail) {
        return errorResponse(res, 'Email and user_id are required', 400);
      }

      const { data: customerRecord, error: customerError } = await supabaseAdmin
        .from('customers')
        .select('*')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (customerError) {
        throw customerError;
      }

      if (!customerRecord) {
        return successResponse(res, { linked: false }, 'No customer record matched this email');
      }

      const updates: Record<string, any> = {
        user_id: userId,
        updated_at: new Date().toISOString(),
      };

      if (!customerRecord.source || customerRecord.source === 'guest_checkout' || customerRecord.source === 'backfill') {
        updates.source = 'registered';
      }

      const { error: updateCustomerError } = await supabaseAdmin
        .from('customers')
        .update(updates)
        .eq('id', customerRecord.id);

      if (updateCustomerError) {
        throw updateCustomerError;
      }

      const updatedOrderIds: string[] = [];

      const { data: ordersByCustomer, error: ordersByCustomerError } = await supabaseAdmin
        .from('orders')
        .update({ user_id: userId })
        .eq('customer_id', customerRecord.id)
        .select('id');

      if (ordersByCustomerError) {
        throw ordersByCustomerError;
      }

      ordersByCustomer?.forEach((order) => {
        if (order?.id) {
          updatedOrderIds.push(order.id);
        }
      });

      const { data: ordersByEmail, error: ordersByEmailError } = await supabaseAdmin
        .from('orders')
        .update({ user_id: userId })
        .eq('user_id', null)
        .eq('customer_id', null)
        .eq('shipping_address->>email', normalizedEmail)
        .select('id');

      if (ordersByEmailError && ordersByEmailError.code !== '22P02') {
        throw ordersByEmailError;
      }

      ordersByEmail?.forEach((order) => {
        if (order?.id) {
          updatedOrderIds.push(order.id);
        }
      });

      return successResponse(
        res,
        {
          linked: true,
          customer_id: customerRecord.id,
          orders_linked: updatedOrderIds.length,
          order_ids: updatedOrderIds,
        },
        'Customer linked to user successfully'
      );
    } catch (error: any) {
      console.error('Error linking customer to user:', error);
      return errorResponse(res, error?.message || 'Failed to link customer to user');
    }
  }

  async createCustomer(req: AuthRequest, res: Response) {
    try {
      const { full_name, email, phone } = req.body || {};

      if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
        return errorResponse(res, 'Customer full name is required', 400);
      }

      if (!phone || typeof phone !== 'string' || phone.trim().length < 5) {
        return errorResponse(res, 'Customer phone number is required', 400);
      }

      const trimmedName = full_name.trim();
      const normalizedEmail = typeof email === 'string' && email.trim().length > 0 ? email.trim().toLowerCase() : null;
      const trimmedPhone = phone.trim();

      let emailToUse = normalizedEmail;
      if (!emailToUse) {
        const { alias } = resolveFallbackEmail();
        emailToUse = alias;
      }

      const customer = await customerService.upsertCustomer({
        userId: null,
        email: emailToUse,
        fullName: trimmedName,
        phone: trimmedPhone,
        createdBy: req.user?.id || null,
        source: 'manual',
      });

      return successResponse(res, customer, 'Customer created successfully', 201);
    } catch (error: any) {
      console.error('Unexpected error creating customer:', error);
      return errorResponse(res, error?.message || 'Failed to create customer', 500);
    }
  }

  async searchCustomers(req: AuthRequest, res: Response) {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      if (!query.trim()) {
        return successResponse(res, [], 'No query provided');
      }

      const results = await customerService.searchCustomers(query.trim(), 20);
      return successResponse(res, results, 'Customers fetched successfully');
    } catch (error: any) {
      console.error('Error searching customers:', error);
      return errorResponse(res, error?.message || 'Failed to search customers', 500);
    }
  }
}

export const customerController = new CustomerController();
