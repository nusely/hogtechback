import { Resend } from 'resend';
import fs from 'fs';
import { supabaseAdmin } from '../utils/supabaseClient';
import { settingsService } from './settings.service';
import { resolveTemplatePath } from '../utils/templatePath';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

interface UserPreferences {
  email_notifications: boolean;
  newsletter_subscribed: boolean;
  sms_notifications: boolean;
}

class EnhancedEmailService {
  private resend: Resend | null;
  private supportEmail: string;
  private noreplyEmail: string;
  private enabled: boolean;

  constructor() {
    const resendApiKey = process.env.RESEND_API_KEY;
    
    if (!resendApiKey) {
      console.error('⚠️ RESEND_API_KEY is missing - email service will be disabled');
      console.error('   Set RESEND_API_KEY in environment variables to enable email sending');
      this.resend = null;
      this.enabled = false;
    } else {
      try {
        this.resend = new Resend(resendApiKey);
        this.enabled = true;
        console.log('✅ Resend email service initialized');
      } catch (error) {
        console.error('❌ Failed to initialize Resend email service:', error);
        this.resend = null;
        this.enabled = false;
      }
    }
    
    // Support email for customer-facing emails (order confirmations, replies, etc.)
    this.supportEmail = process.env.RESEND_SUPPORT_EMAIL || 'VENTECH GADGETS <support@ventechgadgets.com>';
    
    // No-reply email for automated notifications (system updates, password resets, etc.)
    this.noreplyEmail = process.env.RESEND_NOREPLY_EMAIL || 'VENTECH GADGETS <noreply@ventechgadgets.com>';
    
    console.log(`   Support Email: ${this.supportEmail}`);
    console.log(`   No-Reply Email: ${this.noreplyEmail}`);
    console.log(`   Email Service Enabled: ${this.enabled}`);
  }

  // Get user communication preferences
  private async getUserPreferences(userId: string): Promise<UserPreferences> {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('email_notifications, newsletter_subscribed, sms_notifications')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('Error fetching user preferences:', error);
        // Return default preferences if user not found
        return {
          email_notifications: true,
          newsletter_subscribed: false,
          sms_notifications: true,
        };
      }

      return {
        email_notifications: data.email_notifications ?? true,
        newsletter_subscribed: data.newsletter_subscribed ?? false,
        sms_notifications: data.sms_notifications ?? true,
      };
    } catch (error) {
      console.error('Error fetching user preferences:', error);
      return {
        email_notifications: true,
        newsletter_subscribed: false,
        sms_notifications: true,
      };
    }
  }

  // Check if user wants to receive emails
  private async shouldSendEmail(userId: string, emailType: 'transactional' | 'newsletter' | 'marketing'): Promise<boolean> {
    const preferences = await this.getUserPreferences(userId);
    
    switch (emailType) {
      case 'transactional':
        return preferences.email_notifications;
      case 'newsletter':
        return preferences.newsletter_subscribed;
      case 'marketing':
        return preferences.newsletter_subscribed;
      default:
        return true;
    }
  }

  async sendEmail(options: EmailOptions, useSupportEmail: boolean = true): Promise<boolean> {
    // Check if email service is enabled
    if (!this.enabled || !this.resend) {
      console.warn('⚠️ Email service is disabled - RESEND_API_KEY missing. Email not sent to:', options.to);
      return false;
    }

    try {
      // Convert attachments to Resend format if provided
      const attachments = options.attachments?.map(att => ({
        filename: att.filename,
        content: att.content.toString('base64'),
      })) || [];

      // Use support email for customer-facing emails, noreply for automated notifications
      const fromEmail = useSupportEmail ? this.supportEmail : this.noreplyEmail;

      const { data, error } = await this.resend.emails.send({
        from: fromEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      if (error) {
        console.error('❌ Error sending email via Resend:', {
          error,
          message: (error as any)?.message || 'Unknown error',
          code: (error as any)?.code,
          details: (error as any)?.details,
          to: options.to,
          subject: options.subject,
          from: fromEmail,
        });
        return false;
      }

      console.log(`✅ Email sent successfully via Resend [${useSupportEmail ? 'Support' : 'No-Reply'}] to ${options.to}:`, data?.id);
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  // Enhanced order confirmation email with preference check
  async sendOrderConfirmation(orderData: any): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
    try {
      // Log email attempt
      console.log('📧 sendOrderConfirmation called:', {
        order_number: orderData.order_number,
        customer_email: orderData.customer_email,
        user_id: orderData.user_id,
        has_items: !!(orderData.items && orderData.items.length > 0),
      });

      // Always send order confirmation emails (critical transactional emails)
      // Only check user preferences if user_id exists (for logged-in users)
      // For guest orders, always send
      if (orderData.user_id) {
        try {
          const shouldSend = await this.shouldSendEmail(orderData.user_id, 'transactional');
          console.log(`📧 User preferences check for user ${orderData.user_id}: shouldSend=${shouldSend}`);
          
          if (!shouldSend) {
            console.log(`⚠️ Skipping order confirmation email for user ${orderData.user_id} - email notifications disabled`);
            return { success: true, skipped: true, reason: 'User has disabled email notifications' };
          }
        } catch (prefError: any) {
          console.error('❌ Error checking user preferences (sending email anyway):', prefError?.message || prefError);
          // Continue sending email even if preferences check fails
        }
      } else {
        console.log('📧 Guest order - skipping user preferences check, sending email');
      }

      const templatePath = resolveTemplatePath('order-confirmation.html');
      console.log('✅ Email template found at:', templatePath);
      let template = fs.readFileSync(templatePath, 'utf8');

      // Calculate values for email
      const subtotal = orderData.subtotal || orderData.total || 0;
      const shippingFee = orderData.shipping_fee || orderData.delivery_fee || 0;
      const total = orderData.total || 0;
      const paymentMethod = orderData.payment_method || 'Cash on Delivery';
      const paymentStatus = orderData.payment_status || 'Pending';
      
      // Format payment method for display
      const paymentMethodDisplay = paymentMethod
        .split('_')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      // Format payment status for display
      const paymentStatusDisplay = paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1);
      
      // Get estimated delivery from delivery_option
      const estimatedDelivery = orderData.delivery_address?.delivery_option?.estimated_days 
        ? `${orderData.delivery_address.delivery_option.estimated_days} business days`
        : orderData.delivery_option?.estimated_days 
          ? `${orderData.delivery_option.estimated_days} business days`
          : '2-3 business days';
      
      // Generate tracking URL
      const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://ventechgadgets.com';
      const normalizedFrontendUrl = frontendUrl.replace(/\/$/, '');
      const trackingUrl = `${normalizedFrontendUrl}/track-order?order=${encodeURIComponent(orderData.order_number || '')}`;
      const contactUrl = `${normalizedFrontendUrl}/contact`;

      // Replace placeholders with actual data
      template = template
        .replace(/{{ORDER_NUMBER}}/g, orderData.order_number || '')
        .replace(/{{CUSTOMER_NAME}}/g, orderData.customer_name || 'Customer')
        .replace(/{{CUSTOMER_EMAIL}}/g, orderData.customer_email || '')
        .replace(/{{ORDER_DATE}}/g, new Date(orderData.created_at || new Date()).toLocaleDateString())
        .replace(/{{ORDER_ITEMS}}/g, this.formatOrderItemsForEmail(orderData.items || []))
        .replace(/{{ITEMS_LIST}}/g, this.formatOrderItemsForEmail(orderData.items || [])) // Also support old placeholder
        .replace(/{{SUBTOTAL}}/g, subtotal.toFixed(2))
        .replace(/{{SHIPPING}}/g, shippingFee.toFixed(2))
        .replace(/{{TOTAL}}/g, total.toFixed(2))
        .replace(/{{TOTAL_AMOUNT}}/g, total.toFixed(2)) // Also support old placeholder
        .replace(/{{SHIPPING_ADDRESS}}/g, this.formatAddress(orderData.delivery_address || orderData.shipping_address))
        .replace(/{{DELIVERY_ADDRESS}}/g, this.formatAddress(orderData.delivery_address || orderData.shipping_address)) // Also support old placeholder
        .replace(/{{PAYMENT_METHOD}}/g, paymentMethodDisplay)
        .replace(/{{PAYMENT_STATUS}}/g, paymentStatusDisplay)
        .replace(/{{ESTIMATED_DELIVERY}}/g, estimatedDelivery)
        .replace(/{{TRACKING_URL}}/g, trackingUrl)
        .replace(/{{CONTACT_URL}}/g, contactUrl)
        .replace(/{{ORDER_NOTES}}/g, orderData.notes ? `<div style="background-color: #f9f9f9; border-radius: 8px; padding: 15px; margin: 20px 0;"><h3 style="color: #1A1A1A; font-size: 16px; margin: 0 0 10px 0;">Order Notes:</h3><p style="color: #3A3A3A; font-size: 14px; margin: 0;">${orderData.notes}</p></div>` : '')
        .replace(/{{LOGO_URL}}/g, 'https://files.ventechgadgets.com/ventech_logo_1.webp');

      // Verify placeholder replacement
      const remainingPlaceholders = template.match(/\{\{([^}]+)\}\}/g);
      if (remainingPlaceholders) {
        console.warn('⚠️ Order confirmation template still contains unreplaced placeholders:', remainingPlaceholders);
      } else {
        console.log('✅ All placeholders replaced successfully');
      }
      
      // Log email data for debugging
      console.log('📧 Order confirmation email data:', {
        order_number: orderData.order_number,
        customer_name: orderData.customer_name,
        customer_email: orderData.customer_email,
        subtotal,
        shipping_fee: shippingFee,
        total,
        payment_method: paymentMethodDisplay,
        payment_status: paymentStatusDisplay,
        items_count: (orderData.items || []).length,
        estimated_delivery: estimatedDelivery,
      });

      // Use support email for order confirmations (customers can reply)
      if (!orderData.customer_email) {
        console.error('❌ No customer email provided for order confirmation:', orderData.order_number);
        console.error('   Order data:', {
          order_number: orderData.order_number,
          user_id: orderData.user_id,
          shipping_address: orderData.shipping_address,
          delivery_address: orderData.delivery_address,
        });
        return { success: false, reason: 'No customer email provided' };
      }

      console.log(`📧 Sending order confirmation email to: ${orderData.customer_email}`);
      console.log(`   Order Number: ${orderData.order_number}`);
      console.log(`   Customer Name: ${orderData.customer_name}`);
      console.log(`   Total: GHS ${orderData.total?.toFixed(2) || '0.00'}`);
      console.log(`   Email Service Enabled: ${this.enabled}`);
      console.log(`   Resend Client: ${this.resend ? 'initialized' : 'null'}`);
      
      const success = await this.sendEmail({
        to: orderData.customer_email,
        subject: `Order Confirmation - ${orderData.order_number}`,
        html: template,
      }, true); // true = use support email

      if (!success) {
        console.error('❌ Failed to send order confirmation email to:', orderData.customer_email);
        console.error('   Email service enabled:', this.enabled);
        console.error('   Resend client:', this.resend ? 'available' : 'null');
      } else {
        console.log(`✅ Order confirmation email sent successfully to ${orderData.customer_email}`);
      }

      return { success };
    } catch (error) {
      console.error('Error sending order confirmation:', error);
      return { success: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Enhanced order status update email with preference check
  async sendOrderStatusUpdate(orderData: any, newStatus: string): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
    try {
      // Log email attempt
      console.log('📧 sendOrderStatusUpdate called:', {
        order_number: orderData.order_number,
        customer_email: orderData.customer_email,
        user_id: orderData.user_id,
        new_status: newStatus,
        has_items: !!(orderData.items && orderData.items.length > 0),
      });

      // Always send order status update emails (critical transactional emails)
      // Only check user preferences if user_id exists (for logged-in users)
      // For guest orders, always send status update emails
      if (orderData.user_id) {
        try {
          const shouldSend = await this.shouldSendEmail(orderData.user_id, 'transactional');
          console.log(`📧 User preferences check for user ${orderData.user_id}: shouldSend=${shouldSend}`);
          
          if (!shouldSend) {
            console.log(`⚠️ Skipping order status update email for user ${orderData.user_id} - email notifications disabled`);
            return { success: true, skipped: true, reason: 'User has disabled email notifications' };
          }
        } catch (prefError: any) {
          console.error('❌ Error checking user preferences (sending email anyway):', prefError?.message || prefError);
          // Continue sending email even if preferences check fails
        }
      } else {
        console.log('📧 Guest order - skipping user preferences check, sending email');
      }

      const templatePath = resolveTemplatePath('order-status-update.html');
      console.log('✅ Email template found at:', templatePath);
      let template = fs.readFileSync(templatePath, 'utf8');

      // Generate status message based on status
      const statusMessages: Record<string, string> = {
        'pending': 'Your order is being processed. We will update you soon.',
        'confirmed': 'Your order has been confirmed and is being prepared for shipment.',
        'processing': 'Your order is being processed and will be shipped soon.',
        'shipped': 'Your order has been shipped! You can track it using the tracking number below.',
        'delivered': 'Your order has been delivered! We hope you enjoy your purchase.',
        'cancelled': 'Your order has been cancelled. If you have any questions, please contact us.',
      };
      
      const statusMessage = statusMessages[newStatus.toLowerCase()] || `Your order status has been updated to ${newStatus}.`;
      const trackingNumber = orderData.tracking_number || 'Not available yet';
      
      // Format status for display (capitalize first letter)
      const statusDisplay = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
      
      // Generate public tracking URL (works for guest customers using order number)
      const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://ventechgadgets.com';
      const normalizedFrontendUrl = frontendUrl.replace(/\/$/, '');
      const trackingUrl = `${normalizedFrontendUrl}/track-order?order=${encodeURIComponent(orderData.order_number || '')}`;
      const contactUrl = `${normalizedFrontendUrl}/contact`;
      
      // Get customer name - try multiple sources
      const customerName = orderData.customer_name || 
                          (orderData.user?.first_name && orderData.user?.last_name 
                            ? `${orderData.user.first_name} ${orderData.user.last_name}`.trim()
                            : orderData.user?.first_name || 
                              orderData.user?.full_name ||
                              orderData.shipping_address?.full_name ||
                              orderData.delivery_address?.full_name ||
                              'Customer');
      
      template = template
        .replace(/{{ORDER_NUMBER}}/g, orderData.order_number || '')
        .replace(/{{CUSTOMER_NAME}}/g, customerName)
        .replace(/{{NEW_STATUS}}/g, statusDisplay)
        .replace(/{{STATUS_MESSAGE}}/g, statusMessage)
        .replace(/{{TRACKING_NUMBER}}/g, trackingNumber)
        .replace(/{{ORDER_DATE}}/g, new Date(orderData.created_at || new Date()).toLocaleDateString())
        .replace(/{{TOTAL_AMOUNT}}/g, `GHS ${orderData.total?.toFixed(2) || '0.00'}`)
        .replace(/{{ORDER_ITEMS}}/g, this.formatOrderItemsForEmail(orderData.items || orderData.order_items || []))
        .replace(/{{TRACKING_URL}}/g, trackingUrl)
        .replace(/{{CONTACT_URL}}/g, contactUrl)
        .replace(/{{LOGO_URL}}/g, 'https://files.ventechgadgets.com/ventech_logo_1.webp');

      // Verify placeholder replacement
      const remainingPlaceholders = template.match(/\{\{([^}]+)\}\}/g);
      if (remainingPlaceholders) {
        console.warn('⚠️ Order status update template still contains unreplaced placeholders:', remainingPlaceholders);
      } else {
        console.log('✅ All placeholders replaced successfully');
      }
      
      // Log email data for debugging
      console.log('📧 Order status update email data:', {
        order_number: orderData.order_number,
        customer_name: customerName,
        customer_email: orderData.customer_email,
        new_status: statusDisplay,
        tracking_number: trackingNumber,
        items_count: (orderData.items || orderData.order_items || []).length,
      });

      // Use support email for order status updates (customers can reply)
      if (!orderData.customer_email) {
        console.error('❌ No customer email provided for order status update:', orderData.order_number);
        return { success: false, reason: 'No customer email provided' };
      }

      console.log(`📧 Sending order status update email to: ${orderData.customer_email}`);
      console.log(`   Order Number: ${orderData.order_number}`);
      console.log(`   New Status: ${newStatus}`);
      console.log(`   Tracking Number: ${trackingNumber}`);
      console.log(`   Email Service Enabled: ${this.enabled}`);
      console.log(`   Resend Client: ${this.resend ? 'initialized' : 'null'}`);
      
      const success = await this.sendEmail({
        to: orderData.customer_email,
        subject: `Order Update - ${orderData.order_number}`,
        html: template,
      }, true); // true = use support email

      if (!success) {
        console.error('❌ Failed to send order status update email to:', orderData.customer_email);
        console.error('   Email service enabled:', this.enabled);
        console.error('   Resend client:', this.resend ? 'available' : 'null');
      } else {
        console.log(`✅ Order status update email sent successfully to ${orderData.customer_email}`);
      }

      return { success };
    } catch (error) {
      console.error('Error sending order status update:', error);
      return { success: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async sendOrderCancellation(orderData: any): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
    try {
      console.log('📧 sendOrderCancellation called:', {
        order_number: orderData.order_number,
        customer_email: orderData.customer_email,
        user_id: orderData.user_id,
        cancelled_by: orderData.cancelled_by,
      });

      if (orderData.user_id) {
        try {
          const shouldSend = await this.shouldSendEmail(orderData.user_id, 'transactional');
          if (!shouldSend) {
            console.log(`⚠️ Skipping cancellation email for user ${orderData.user_id} - email notifications disabled`);
            return { success: true, skipped: true, reason: 'User has disabled email notifications' };
          }
        } catch (prefError: any) {
          console.error('❌ Error checking user preferences for cancellation email (sending anyway):', prefError?.message || prefError);
        }
      }

      const templatePath = resolveTemplatePath('order-cancellation.html');
      let template = fs.readFileSync(templatePath, 'utf8');

      const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://ventechgadgets.com';
      const normalizedFrontendUrl = frontendUrl.replace(/\/$/, '');
      const trackingUrl = `${normalizedFrontendUrl}/track-order?order=${encodeURIComponent(orderData.order_number || '')}`;

      const cancellationReason =
        orderData.cancellation_reason ||
        (orderData.cancelled_by === 'customer' ? 'Cancelled by customer request' : 'Order cancelled by administrator');

      const customerName =
        orderData.customer_name ||
        orderData.user?.full_name ||
        `${orderData.user?.first_name || ''} ${orderData.user?.last_name || ''}`.trim() ||
        orderData.shipping_address?.full_name ||
        orderData.delivery_address?.full_name ||
        'Customer';

      template = template
        .replace(/{{CUSTOMER_NAME}}/g, customerName)
        .replace(/{{ORDER_NUMBER}}/g, orderData.order_number || '')
        .replace(/{{CANCELLATION_REASON}}/g, cancellationReason)
        .replace(/{{CANCELLATION_DATE}}/g, new Date().toLocaleDateString())
        .replace(/{{TRACKING_URL}}/g, trackingUrl);

      if (!orderData.customer_email) {
        console.error('❌ No customer email provided for order cancellation:', orderData.order_number);
        return { success: false, reason: 'No customer email provided' };
      }

      const success = await this.sendEmail(
        {
          to: orderData.customer_email,
          subject: `Order Cancelled - ${orderData.order_number}`,
          html: template,
        },
        true
      );

      if (!success) {
        console.error('❌ Failed to send order cancellation email to:', orderData.customer_email);
        return { success: false, reason: 'Failed to send email' };
      }

      console.log(`✅ Order cancellation email sent successfully to ${orderData.customer_email}`);
      return { success: true };
    } catch (error) {
      console.error('Error sending order cancellation email:', error);
      return { success: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Enhanced newsletter email with preference check
  async sendNewsletter(userId: string, subject: string, content: string): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
    try {
      // Check if email notifications are enabled in settings
      const emailNotificationsEnabled = await settingsService.isEnabled('email_notifications_enabled');
      if (!emailNotificationsEnabled) {
        console.log('Email notifications are disabled in settings');
        return { success: true, skipped: true, reason: 'Email notifications disabled in settings' };
      }

      // Check if user wants to receive newsletter emails
      const shouldSend = await this.shouldSendEmail(userId, 'newsletter');
      
      if (!shouldSend) {
        console.log(`Skipping newsletter email for user ${userId} - newsletter subscription disabled`);
        return { success: true, skipped: true, reason: 'User has unsubscribed from newsletter' };
      }

      // Get user email
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('email')
        .eq('id', userId)
        .single();

      if (error || !user) {
        return { success: false, reason: 'User not found' };
      }

      // Use noreply for newsletters (automated, no reply needed)
      const success = await this.sendEmail({
        to: user.email,
        subject: subject,
        html: content,
      }, false); // false = use noreply email

      return { success };
    } catch (error) {
      console.error('Error sending newsletter:', error);
      return { success: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Helper methods (same as original)
  private formatAddress(address: any): string {
    if (!address) return 'No address provided';
    
    const parts = [
      address.street_address || address.street,
      address.city,
      address.region,
      address.postal_code,
      address.country || 'Ghana'
    ].filter(Boolean);
    
    if (address.full_name) parts.unshift(address.full_name);
    if (address.phone) parts.push(`Phone: ${address.phone}`);
    
    return parts.join(', ');
  }

  private formatOrderItems(items: any[]): string {
    if (!items || items.length === 0) return 'No items';
    
    return items.map(item => {
      const unitPrice = item.unit_price || item.price || 0;
      const subtotal = item.subtotal || (unitPrice * (item.quantity || 0));
      const productImage = this.normalizeImageUrl(item.product_image || item.image || null);
      return `<tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">
          ${productImage ? `<img src="${productImage}" alt="${item.product_name || 'Product'}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; margin-right: 10px;">` : ''}
          ${item.product_name || 'Product'}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.quantity || 0}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">GHS ${unitPrice.toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">GHS ${subtotal.toFixed(2)}</td>
      </tr>`;
    }).join('');
  }

  // Format order items for email template (matches template format)
  private formatOrderItemsForEmail(items: any[]): string {
    if (!items || items.length === 0) return '<div style="padding: 15px; text-align: center; color: #3A3A3A;">No items in order</div>';
    
    return items.map(item => {
      const productName = item.product_name || 'Product';
      const quantity = item.quantity || 0;
      const unitPrice = item.unit_price || item.price || 0;
      const subtotal = item.total_price || item.subtotal || (unitPrice * quantity);
      const productImage = this.normalizeImageUrl(item.product_image || item.image || null);
      const variantInfo = item.selected_variants 
        ? Object.entries(item.selected_variants).map(([key, value]: [string, any]) => `${key}: ${value}`).join(', ')
        : '';
      
      return `
        <div style="padding: 15px; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center;">
          <img src="${productImage}" alt="${productName}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; margin-right: 15px;">
          <div style="flex: 1;">
            <h3 style="margin: 0 0 5px 0; color: #1A1A1A; font-size: 16px;">${productName}</h3>
            <p style="margin: 0; color: #3A3A3A; font-size: 14px;">Qty: ${quantity}</p>
            ${variantInfo ? `<p style="margin: 5px 0 0 0; color: #3A3A3A; font-size: 12px;">${variantInfo}</p>` : ''}
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; color: #FF7A19; font-size: 16px; font-weight: bold;">GHC ${subtotal.toFixed(2)}</p>
            <p style="margin: 5px 0 0 0; color: #3A3A3A; font-size: 12px;">GHC ${unitPrice.toFixed(2)} each</p>
          </div>
        </div>
      `;
    }).join('');
  }

  private normalizeImageUrl(imageUrl?: string | null): string {
    const placeholder = `${process.env.R2_PUBLIC_URL?.replace(/\/$/, '') || 'https://files.ventechgadgets.com'}/placeholder-product.webp`;
    if (!imageUrl || typeof imageUrl !== 'string') {
      return placeholder;
    }

    let url = imageUrl.trim();
    if (!url) {
      return placeholder;
    }

    if (url.startsWith('data:')) {
      return url;
    }

    const frontendBase =
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'https://ventechgadgets.com';
    const normalizedFrontendBase = frontendBase.replace(/\/$/, '');
    const r2Base = process.env.R2_PUBLIC_URL
      ? process.env.R2_PUBLIC_URL.replace(/\/$/, '')
      : 'https://files.ventechgadgets.com';

    try {
      const parsed = new URL(url);
      if (parsed.pathname.startsWith('/_next/image')) {
        const original = parsed.searchParams.get('url');
        if (original) {
          return this.normalizeImageUrl(decodeURIComponent(original));
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

  // Send admin order notification email
  async sendAdminOrderNotification(orderData: any): Promise<{ success: boolean; reason?: string }> {
    try {
      let template: string;
      try {
        const templatePath = resolveTemplatePath('admin-order-notification.html');
        template = fs.readFileSync(templatePath, 'utf8');
      } catch (templateError) {
        console.warn('⚠️ Admin order notification template not found, using inline fallback.', templateError);
        // Inline template for admin notification
        template = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #FF7A19; color: white; padding: 20px; text-align: center; }
              .content { background: #f9f9f9; padding: 20px; }
              .order-info { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #FF7A19; }
              .item { padding: 10px; border-bottom: 1px solid #eee; }
              .total { font-size: 18px; font-weight: bold; color: #FF7A19; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>New Order Received</h1>
              </div>
              <div class="content">
                <div class="order-info">
                  <h2>Order #{{ORDER_NUMBER}}</h2>
                  <p><strong>Customer:</strong> {{CUSTOMER_NAME}}</p>
                  <p><strong>Email:</strong> {{CUSTOMER_EMAIL}}</p>
                  <p><strong>Date:</strong> {{ORDER_DATE}}</p>
                  <p><strong>Total:</strong> GHS {{TOTAL_AMOUNT}}</p>
                  {{ORDER_NOTES}}
                </div>
                <h3>Order Items:</h3>
                {{ITEMS_LIST}}
                <div class="total">
                  Total Amount: GHS {{TOTAL_AMOUNT}}
                </div>
                <p><strong>Delivery Address:</strong></p>
                <p>{{DELIVERY_ADDRESS}}</p>
              </div>
            </div>
          </body>
          </html>
        `;
      }

      // Replace placeholders
      template = template
        .replace(/{{ORDER_NUMBER}}/g, orderData.order_number)
        .replace(/{{CUSTOMER_NAME}}/g, orderData.customer_name || 'Guest Customer')
        .replace(/{{CUSTOMER_EMAIL}}/g, orderData.customer_email || 'No email')
        .replace(/{{ORDER_DATE}}/g, new Date(orderData.created_at).toLocaleString())
        .replace(/{{TOTAL_AMOUNT}}/g, orderData.total.toFixed(2))
        .replace(/{{DELIVERY_ADDRESS}}/g, this.formatAddress(orderData.delivery_address))
        .replace(/{{ITEMS_LIST}}/g, this.formatOrderItems(orderData.items || []))
        .replace(/{{ORDER_NOTES}}/g, orderData.notes ? `<div style="background-color: #f9f9f9; border-radius: 8px; padding: 15px; margin: 20px 0;"><h3 style="color: #1A1A1A; font-size: 16px; margin: 0 0 10px 0;">Order Notes:</h3><p style="color: #3A3A3A; font-size: 14px; margin: 0;">${orderData.notes}</p></div>` : '');

      // Use support email for admin notifications (they can reply)
      // Send to ventechgadgets@gmail.com
      const success = await this.sendEmail({
        to: 'ventechgadgets@gmail.com',
        subject: `New Order Received - ${orderData.order_number}`,
        html: template,
      }, true); // true = use support email

      return { success };
    } catch (error) {
      console.error('Error sending admin order notification:', error);
      return { success: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Enhanced wishlist reminder email with settings check
  async sendWishlistReminder(userId: string, wishlistItems: any[]): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
    try {
      // Check if email notifications are enabled in settings
      const emailNotificationsEnabled = await settingsService.isEnabled('email_notifications_enabled');
      if (!emailNotificationsEnabled) {
        console.log('Email notifications are disabled in settings');
        return { success: true, skipped: true, reason: 'Email notifications disabled in settings' };
      }

      // Check if wishlist reminder emails are enabled
      const wishlistRemindersEnabled = await settingsService.isEnabled('email_wishlist_reminders');
      if (!wishlistRemindersEnabled) {
        console.log('Wishlist reminder emails are disabled in settings');
        return { success: true, skipped: true, reason: 'Wishlist reminder emails disabled in settings' };
      }

      // Check if user wants to receive emails
      const shouldSend = await this.shouldSendEmail(userId, 'marketing');
      if (!shouldSend) {
        console.log(`Skipping wishlist reminder email for user ${userId} - email notifications disabled`);
        return { success: true, skipped: true, reason: 'User has disabled email notifications' };
      }

      // Get user email
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('email, first_name, last_name')
        .eq('id', userId)
        .single();

      if (error || !user) {
        return { success: false, reason: 'User not found' };
      }

      // Email templates are in the root email-templates folder
      const templatePath = resolveTemplatePath('wishlist-reminder.html');
      let template = fs.readFileSync(templatePath, 'utf8');

      const customerName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Customer';
      template = template
        .replace('{{CUSTOMER_NAME}}', customerName)
        .replace('{{WISHLIST_ITEMS}}', this.formatWishlistItems(wishlistItems));

      // Use noreply for wishlist reminders (automated marketing)
      const success = await this.sendEmail({
        to: user.email,
        subject: 'Items in your wishlist are waiting!',
        html: template,
      }, false); // false = use noreply email

      return { success };
    } catch (error) {
      console.error('Error sending wishlist reminder:', error);
      return { success: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Enhanced cart abandonment reminder email with settings check
  async sendCartAbandonmentReminder(userId: string, cartItems: any[]): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
    try {
      // Check if email notifications are enabled in settings
      const emailNotificationsEnabled = await settingsService.isEnabled('email_notifications_enabled');
      if (!emailNotificationsEnabled) {
        console.log('Email notifications are disabled in settings');
        return { success: true, skipped: true, reason: 'Email notifications disabled in settings' };
      }

      // Check if cart abandonment emails are enabled
      const cartAbandonmentEnabled = await settingsService.isEnabled('email_cart_abandonment');
      if (!cartAbandonmentEnabled) {
        console.log('Cart abandonment emails are disabled in settings');
        return { success: true, skipped: true, reason: 'Cart abandonment emails disabled in settings' };
      }

      // Check if user wants to receive emails
      const shouldSend = await this.shouldSendEmail(userId, 'marketing');
      if (!shouldSend) {
        console.log(`Skipping cart abandonment reminder email for user ${userId} - email notifications disabled`);
        return { success: true, skipped: true, reason: 'User has disabled email notifications' };
      }

      // Get user email
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('email, first_name, last_name')
        .eq('id', userId)
        .single();

      if (error || !user) {
        return { success: false, reason: 'User not found' };
      }

      // Email templates are in the root email-templates folder
      const templatePath = resolveTemplatePath('cart-abandonment.html');
      let template = fs.readFileSync(templatePath, 'utf8');

      const customerName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Customer';
      template = template
        .replace('{{CUSTOMER_NAME}}', customerName)
        .replace('{{CART_ITEMS}}', this.formatCartItems(cartItems));

      // Use noreply for cart abandonment (automated marketing)
      const success = await this.sendEmail({
        to: user.email,
        subject: 'Don\'t forget your items!',
        html: template,
      }, false); // false = use noreply email

      return { success };
    } catch (error) {
      console.error('Error sending cart abandonment reminder:', error);
      return { success: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Format wishlist items for email
  private formatWishlistItems(items: any[]): string {
    if (!items || items.length === 0) return '<p>No items in wishlist</p>';
    
    return items.map(item => `
      <div style="padding: 15px; border-bottom: 1px solid #eee;">
        <h4 style="margin: 0 0 10px 0; color: #FF7A19;">${item.product_name || 'Unknown Product'}</h4>
        <p style="margin: 0; color: #666;">${item.product_description || ''}</p>
        <p style="margin: 5px 0 0 0; font-weight: bold; color: #333;">GHS ${(item.product_price || 0).toFixed(2)}</p>
      </div>
    `).join('');
  }

  // Format cart items for email
  private formatCartItems(items: any[]): string {
    if (!items || items.length === 0) return '<p>No items in cart</p>';
    
    return items.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.product_name || 'Unknown Product'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.quantity || 1}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">GHS ${(item.price || 0).toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">GHS ${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</td>
      </tr>
    `).join('');
  }

  // Send email verification email via Resend
  async sendVerificationEmail(email: string, verificationUrl: string, firstName?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const templatePath = resolveTemplatePath('verification-email.html');
      let template = fs.readFileSync(templatePath, 'utf8');

      // Replace placeholders
      const customerName = firstName ? `Hi ${firstName}!` : 'Hi there!';
      template = template
        .replace(/{{ \.ConfirmationURL }}/g, verificationUrl)  // Template uses {{ .ConfirmationURL }} with spaces
        .replace(/{{\.ConfirmationURL}}/g, verificationUrl)     // Also handle without spaces
        .replace(/{{ConfirmationURL}}/g, verificationUrl)      // Also handle without dot
        .replace(/Hi there! 👋/g, `${customerName} 👋`)       // Replace greeting with personalized name
        .replace(/Hi there!/g, customerName);                  // Also replace without emoji

      // Use noreply for verification emails (automated, no reply needed)
      const success = await this.sendEmail({
        to: email,
        subject: 'Verify Your Email - VENTECH',
        html: template,
      }, false); // false = use noreply email

      if (!success) {
        console.error('❌ Failed to send verification email to:', email);
        return { success: false, error: 'Failed to send verification email' };
      }

      console.log(`✅ Verification email sent successfully via Resend to: ${email}`);
      return { success: true };
    } catch (error) {
      console.error('Error sending verification email:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Send password reset email via Resend
  async sendPasswordResetEmail(email: string, resetUrl: string, firstName?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Email templates are in the root email-templates folder
      // Try both current directory and one level up (backend directory vs project root)
      const templatePath = resolveTemplatePath('password-reset.html');
      let template = fs.readFileSync(templatePath, 'utf8');

      // Replace placeholders
      const customerName = firstName ? `Hello ${firstName}!` : 'Hello!';
      
      // Log the resetUrl for debugging
      console.log('Password reset URL:', resetUrl);
      console.log('Reset URL length:', resetUrl?.length || 0);
      
      // Check if resetUrl is empty or invalid
      if (!resetUrl || resetUrl.trim() === '') {
        console.error('⚠️ Password reset URL is empty!');
        return { success: false, error: 'Password reset URL is empty' };
      }
      
      template = template
        .replace(/{{ \.ConfirmationURL }}/g, resetUrl)  // Template uses {{ .ConfirmationURL }} with spaces
        .replace(/{{\.ConfirmationURL}}/g, resetUrl)     // Also handle without spaces
        .replace(/{{ConfirmationURL}}/g, resetUrl)      // Also handle without dot
        .replace(/Hello! 👋/g, `${customerName} 👋`)   // Replace greeting with personalized name
        .replace(/Hello!/g, customerName);              // Also replace without emoji

      // Verify replacement worked
      if (template.includes('{{ .ConfirmationURL }}') || template.includes('{{.ConfirmationURL}}') || template.includes('{{ConfirmationURL}}')) {
        console.error('⚠️ Password reset URL placeholder was not replaced!');
        console.log('Template contains placeholders:', template.includes('{{'));
      }

      // Use noreply for password reset emails (automated, no reply needed)
      const success = await this.sendEmail({
        to: email,
        subject: 'Reset Your Password - VENTECH',
        html: template,
      }, false); // false = use noreply email

      if (!success) {
        console.error('❌ Failed to send password reset email to:', email);
        return { success: false, error: 'Failed to send password reset email' };
      }

      console.log(`✅ Password reset email sent successfully via Resend to: ${email}`);
      return { success: true };
    } catch (error) {
      console.error('Error sending password reset email:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Investment email (no preference check needed - always send to admin)
  async sendInvestmentEmail(investmentData: any): Promise<{ success: boolean; error?: string }> {
    try {
      const { fullName, email, phone, tier, amount, plan, message } = investmentData;
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>New Investment Request - VENTECH</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #FF7A19;">New Investment Request - VENTECH Laptop Banking</h2>
            
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Investment Details</h3>
              <p><strong>Name:</strong> ${fullName}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Phone:</strong> ${phone}</p>
              <p><strong>Tier:</strong> ${tier}</p>
              <p><strong>Amount:</strong> GHS ${amount}</p>
              <p><strong>Plan:</strong> ${plan}</p>
              ${message ? `<p><strong>Message:</strong> ${message}</p>` : ''}
            </div>
            
            <p>This investment request was submitted through the VENTECH website.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
              <p>VENTECH Gadgets - Your Trusted Tech Partner</p>
              <p>Email: ventechgadgets@gmail.com | Phone: +233 55 134 4310</p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Use support email for investment requests (admin can reply)
      const success = await this.sendEmail({
        to: 'ventechgadgets@gmail.com',
        subject: `New Investment Request - ${fullName}`,
        html: html,
      }, true); // true = use support email

      return { success };
    } catch (error) {
      console.error('Error sending investment email:', error);
      return { success: false, error: 'Failed to send investment email' };
    }
  }
}

export default new EnhancedEmailService();
export { sendInvestmentEmail } from './email.service';
