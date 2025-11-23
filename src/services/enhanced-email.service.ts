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
    this.supportEmail = process.env.RESEND_SUPPORT_EMAIL || 'Hedgehog Technologies <support@hogtechgh.com>';
    
    // No-reply email for automated notifications (system updates, password resets, etc.)
    this.noreplyEmail = process.env.RESEND_NOREPLY_EMAIL || 'Hedgehog Technologies <noreply@hogtechgh.com>';
    
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

      // Fetch product images for order items - always enrich to ensure we have latest images
      let orderItems = orderData.items || [];
      console.log('📧 Order confirmation - items before enrichment:', orderItems.length);
      if (orderItems.length > 0) {
        orderItems = await this.enrichOrderItemsWithImages(orderItems);
        console.log('📧 Order confirmation - items after enrichment:', orderItems.length);
      }

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

      // Generate price breakdown
      const discountAmount = orderData.discount || 0;
      const taxAmount = orderData.tax || 0;
      const priceBreakdownHtml = this.generatePriceBreakdownHtml({
        subtotal,
        discount: discountAmount,
        discountCode: orderData.discount_code || null,
        tax: taxAmount,
        shipping: shippingFee,
        total,
      });
      
      // Get estimated delivery from delivery_option
      const estimatedDelivery = orderData.delivery_address?.delivery_option?.estimated_days 
        ? `${orderData.delivery_address.delivery_option.estimated_days} business days`
        : orderData.delivery_option?.estimated_days 
          ? `${orderData.delivery_option.estimated_days} business days`
          : '2-3 business days';
      
      // Generate tracking URL
      const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://hogtechgh.com';
      const normalizedFrontendUrl = frontendUrl.replace(/\/$/, '');
      const trackingUrl = `${normalizedFrontendUrl}/track-order?order=${encodeURIComponent(orderData.order_number || '')}`;
      const contactUrl = `${normalizedFrontendUrl}/contact`;

      // Replace placeholders with actual data
      template = template
        .replace(/{{ORDER_NUMBER}}/g, orderData.order_number || '')
        .replace(/{{CUSTOMER_NAME}}/g, orderData.customer_name || 'Customer')
        .replace(/{{CUSTOMER_EMAIL}}/g, orderData.customer_email || '')
        .replace(/{{ORDER_DATE}}/g, new Date(orderData.created_at || new Date()).toLocaleDateString())
        .replace(/{{ORDER_ITEMS}}/g, this.formatOrderItemsForEmail(orderItems))
        .replace(/{{ITEMS_LIST}}/g, this.formatOrderItemsForEmail(orderItems)) // Also support old placeholder
        .replace(/{{SUBTOTAL}}/g, subtotal.toFixed(2))
        .replace(/{{SHIPPING}}/g, shippingFee.toFixed(2))
        .replace(/{{TOTAL}}/g, total.toFixed(2))
        .replace(/{{PRICE_BREAKDOWN}}/g, priceBreakdownHtml)
        .replace(/{{TOTAL_AMOUNT}}/g, total.toFixed(2)) // Also support old placeholder
        .replace(/{{SHIPPING_ADDRESS}}/g, this.formatAddress(orderData.delivery_address || orderData.shipping_address))
        .replace(/{{DELIVERY_ADDRESS}}/g, this.formatAddress(orderData.delivery_address || orderData.shipping_address)) // Also support old placeholder
        .replace(/{{PAYMENT_METHOD}}/g, paymentMethodDisplay)
        .replace(/{{PAYMENT_STATUS}}/g, paymentStatusDisplay)
        .replace(/{{ESTIMATED_DELIVERY}}/g, estimatedDelivery)
        .replace(/{{TRACKING_URL}}/g, trackingUrl)
        .replace(/{{CONTACT_URL}}/g, contactUrl)
        .replace(/{{ORDER_NOTES}}/g, orderData.notes ? `<div style="background-color: #f9f9f9; border-radius: 8px; padding: 15px; margin: 20px 0;"><h3 style="color: #1A1A1A; font-size: 16px; margin: 0 0 10px 0;">Order Notes:</h3><p style="color: #3A3A3A; font-size: 14px; margin: 0;">${orderData.notes}</p></div>` : '')
        .replace(/{{LOGO_URL}}/g, 'https://files.hogtechgh.com/IMG_0718.PNG');

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
      const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://hogtechgh.com';
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
      
      // Fetch product images for order items if they don't have images
      let orderItems = orderData.items || orderData.order_items || [];
      if (orderItems.length > 0) {
        orderItems = await this.enrichOrderItemsWithImages(orderItems);
      }
      
      // Calculate price breakdown for updated order
      const subtotal = orderData.subtotal || 0;
      const discountAmount = orderData.discount || 0;
      const taxAmount = orderData.tax || 0;
      const shippingFee = orderData.shipping_fee || orderData.delivery_fee || 0;
      const total = orderData.total || 0;
      
      // Generate price breakdown HTML
      const priceBreakdownHtml = this.generatePriceBreakdownHtml({
        subtotal,
        discount: discountAmount,
        discountCode: orderData.discount_code || null,
        tax: taxAmount,
        shipping: shippingFee,
        total,
      });
      
      template = template
        .replace(/{{ORDER_NUMBER}}/g, orderData.order_number || '')
        .replace(/{{CUSTOMER_NAME}}/g, customerName)
        .replace(/{{NEW_STATUS}}/g, statusDisplay)
        .replace(/{{STATUS_MESSAGE}}/g, statusMessage)
        .replace(/{{TRACKING_NUMBER}}/g, trackingNumber)
        .replace(/{{ORDER_DATE}}/g, new Date(orderData.created_at || new Date()).toLocaleDateString())
        .replace(/{{TOTAL_AMOUNT}}/g, `GHS ${total.toFixed(2)}`)
        .replace(/{{ORDER_ITEMS}}/g, this.formatOrderItemsForEmail(orderItems))
        .replace(/{{PRICE_BREAKDOWN}}/g, priceBreakdownHtml)
        .replace(/{{TRACKING_URL}}/g, trackingUrl)
        .replace(/{{CONTACT_URL}}/g, contactUrl)
        .replace(/{{LOGO_URL}}/g, 'https://files.hogtechgh.com/IMG_0718.PNG');

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

  // Send order update email (for shipping cost changes, notes, etc.)
  async sendOrderUpdate(
    orderData: any,
    updateInfo: {
      shipping_fee_changed?: boolean;
      notes_added?: boolean;
      old_shipping_fee?: number;
      new_shipping_fee?: number;
      notes?: string | null;
    }
  ): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
    try {
      console.log('📧 sendOrderUpdate called:', {
        order_number: orderData.order_number,
        customer_email: orderData.customer_email,
        user_id: orderData.user_id,
        shipping_fee_changed: updateInfo.shipping_fee_changed,
        notes_added: updateInfo.notes_added,
      });

      // Always send order update emails (critical transactional emails)
      if (orderData.user_id) {
        try {
          const shouldSend = await this.shouldSendEmail(orderData.user_id, 'transactional');
          if (!shouldSend) {
            console.log(`⚠️ Skipping order update email for user ${orderData.user_id} - email notifications disabled`);
            return { success: true, skipped: true, reason: 'User has disabled email notifications' };
          }
        } catch (prefError: any) {
          console.error('❌ Error checking user preferences (sending email anyway):', prefError?.message || prefError);
        }
      }

      const templatePath = resolveTemplatePath('order-status-update.html');
      let template = fs.readFileSync(templatePath, 'utf8');

      const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://hogtechgh.com';
      const normalizedFrontendUrl = frontendUrl.replace(/\/$/, '');
      const trackingUrl = `${normalizedFrontendUrl}/track-order?order=${encodeURIComponent(orderData.order_number || '')}`;
      const contactUrl = `${normalizedFrontendUrl}/contact`;

      const customerName =
        orderData.customer_name ||
        (orderData.user?.first_name && orderData.user?.last_name
          ? `${orderData.user.first_name} ${orderData.user.last_name}`.trim()
          : orderData.user?.first_name ||
            orderData.user?.full_name ||
            orderData.shipping_address?.full_name ||
            orderData.delivery_address?.full_name ||
            'Customer');

      // Build update message
      let updateMessage = 'Your order details have been updated.';
      const updateDetails: string[] = [];

      if (updateInfo.shipping_fee_changed && updateInfo.old_shipping_fee !== undefined && updateInfo.new_shipping_fee !== undefined) {
        const feeChange = updateInfo.new_shipping_fee - updateInfo.old_shipping_fee;
        if (feeChange > 0) {
          updateDetails.push(`Shipping fee increased from GHS ${updateInfo.old_shipping_fee.toFixed(2)} to GHS ${updateInfo.new_shipping_fee.toFixed(2)} (+GHS ${feeChange.toFixed(2)})`);
        } else if (feeChange < 0) {
          updateDetails.push(`Shipping fee reduced from GHS ${updateInfo.old_shipping_fee.toFixed(2)} to GHS ${updateInfo.new_shipping_fee.toFixed(2)} (GHS ${Math.abs(feeChange).toFixed(2)} refund)`);
        }
      }

      if (updateInfo.notes_added && updateInfo.notes) {
        updateDetails.push(`Admin note: ${updateInfo.notes}`);
      }

      if (updateDetails.length > 0) {
        updateMessage = `Your order details have been updated:\n\n${updateDetails.join('\n\n')}`;
      }

      template = template
        .replace(/{{ORDER_NUMBER}}/g, orderData.order_number || '')
        .replace(/{{CUSTOMER_NAME}}/g, customerName)
        .replace(/{{NEW_STATUS}}/g, orderData.status ? orderData.status.charAt(0).toUpperCase() + orderData.status.slice(1) : 'Updated')
        .replace(/{{STATUS_MESSAGE}}/g, updateMessage)
        .replace(/{{TRACKING_NUMBER}}/g, orderData.tracking_number || 'Not available yet')
        .replace(/{{ORDER_DATE}}/g, new Date(orderData.created_at || new Date()).toLocaleDateString())
        .replace(/{{TOTAL_AMOUNT}}/g, `GHS ${orderData.total?.toFixed(2) || '0.00'}`)
        .replace(/{{ORDER_ITEMS}}/g, this.formatOrderItemsForEmail(orderData.items || orderData.order_items || []))
        .replace(/{{TRACKING_URL}}/g, trackingUrl)
        .replace(/{{CONTACT_URL}}/g, contactUrl)
        .replace(/{{LOGO_URL}}/g, 'https://files.hogtechgh.com/IMG_0718.PNG');

      if (!orderData.customer_email) {
        console.error('❌ No customer email provided for order update:', orderData.order_number);
        return { success: false, reason: 'No customer email provided' };
      }

      console.log(`📧 Sending order update email to: ${orderData.customer_email}`);
      const success = await this.sendEmail(
        {
          to: orderData.customer_email,
          subject: `Order Update - ${orderData.order_number}`,
          html: template,
        },
        true // use support email
      );

      return { success };
    } catch (error) {
      console.error('Error sending order update:', error);
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

      const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_API_URL || 'https://hogtechgh.com';
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
      
      // Try multiple image sources and normalize
      let productImage = this.normalizeImageUrl(
        item.product_image || 
        item.image || 
        item.thumbnail || 
        (item.deal_snapshot && item.deal_snapshot.image) ||
        null
      );
      
      // Ensure we always have an image (use reliable placeholder service)
      const placeholder = 'https://placehold.co/400x400/00afef/white?text=Product+Image';
      if (!productImage || productImage.includes('placeholder')) {
        productImage = placeholder;
      }
      
      // Log for debugging
      console.log(`📧 Email item image for ${productName}:`, {
        product_id: item.product_id,
        product_image: item.product_image,
        image: item.image,
        thumbnail: item.thumbnail,
        normalized: productImage,
        isPlaceholder: productImage === placeholder,
      });
      
      const variantInfo = item.variant_options || item.selected_variants
        ? Object.entries(item.variant_options || item.selected_variants || {}).map(([key, value]: [string, any]) => `${key}: ${value}`).join(', ')
        : '';
      
      return `
        <div style="padding: 15px; border-bottom: 1px solid #e0e0e0; display: flex; align-items: flex-start; gap: 15px;">
          <div style="flex-shrink: 0;">
            <img src="${productImage}" alt="${productName}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; display: block; border: 1px solid #e0e0e0;" />
          </div>
          <div style="flex: 1; min-width: 0;">
            <h3 style="margin: 0 0 5px 0; color: #1A1A1A; font-size: 16px; font-weight: 600; line-height: 1.3;">${productName}</h3>
            <p style="margin: 0; color: #3A3A3A; font-size: 14px;">Qty: ${quantity}</p>
            ${variantInfo ? `<p style="margin: 5px 0 0 0; color: #3A3A3A; font-size: 12px;">${variantInfo}</p>` : ''}
          </div>
          <div style="text-align: right; flex-shrink: 0;">
            <p style="margin: 0; color: #00afef; font-size: 16px; font-weight: bold;">GHC ${subtotal.toFixed(2)}</p>
            <p style="margin: 5px 0 0 0; color: #3A3A3A; font-size: 12px;">GHC ${unitPrice.toFixed(2)} each</p>
          </div>
        </div>
      `;
    }).join('');
  }

  // Format items as table rows for admin notification
  private formatOrderItemsAsTableRows(items: any[]): string {
    if (!items || items.length === 0) {
      return `
        <tr>
          <td colspan="4" style="padding: 16px; text-align: center; color: #6b7280;">No items in order</td>
        </tr>
      `;
    }
    
    return items.map(item => {
      const productName = item.product_name || 'Product';
      const quantity = item.quantity || 0;
      const unitPrice = item.unit_price || item.price || 0;
      const subtotal = item.total_price || item.subtotal || (unitPrice * quantity);
      
      // Try multiple image sources and normalize
      let productImage = this.normalizeImageUrl(
        item.product_image || 
        item.image || 
        item.thumbnail || 
        (item.deal_snapshot && item.deal_snapshot.image) ||
        null
      );
      
      // Ensure we always have an image (use reliable placeholder service)
      const placeholder = 'https://placehold.co/400x400/00afef/white?text=Product+Image';
      if (!productImage || productImage.includes('placeholder')) {
        productImage = placeholder;
      }
      
      const variantInfo = item.variant_options || item.selected_variants
        ? Object.entries(item.variant_options || item.selected_variants || {}).map(([key, value]: [string, any]) => `${key}: ${value}`).join(', ')
        : '';
      
      return `
        <tr>
          <td style="padding: 16px; border-top: 1px solid #e5e7eb; vertical-align: middle;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <img src="${productImage}" alt="${productName}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb;" />
              <div>
                <div style="font-size: 14px; font-weight: 600; color: #1f2937; margin-bottom: 4px;">${productName}</div>
                ${variantInfo ? `<div style="font-size: 12px; color: #6b7280;">${variantInfo}</div>` : ''}
              </div>
            </div>
          </td>
          <td style="padding: 16px; border-top: 1px solid #e5e7eb; vertical-align: middle; text-align: center; color: #1f2937;">
            ${quantity}
          </td>
          <td style="padding: 16px; border-top: 1px solid #e5e7eb; vertical-align: middle; text-align: center; color: #1f2937;">
            GH₵ ${unitPrice.toFixed(2)}
          </td>
          <td style="padding: 16px; border-top: 1px solid #e5e7eb; vertical-align: middle; text-align: right; font-weight: 600; color: #00afef;">
            GH₵ ${subtotal.toFixed(2)}
          </td>
        </tr>
      `;
    }).join('');
  }

  // Enrich order items with product images from database
  private async enrichOrderItemsWithImages(items: any[]): Promise<any[]> {
    if (!items || items.length === 0) {
      return items;
    }

    const itemsWithProductIds = items.filter(item => item.product_id);
    
    if (itemsWithProductIds.length === 0) {
      console.log('📧 No items with product_id to enrich with images');
      return items;
    }

    try {
      const productIds = itemsWithProductIds.map(item => item.product_id);
      console.log('📧 Fetching product images for:', productIds);
      
      const { data: products, error: productsError } = await supabaseAdmin
        .from('products')
        .select('id, thumbnail, images')
        .in('id', productIds);

      if (productsError) {
        console.error('📧 Error fetching products for images:', productsError);
        return items;
      }

      if (products && products.length > 0) {
        console.log('📧 Found products with images:', products.length);
        
        const productImageMap = new Map<string, string>();
        products.forEach((p: any) => {
          // Try thumbnail first, then first image from images array if available
          let imageSource = p.thumbnail;
          
          // If no thumbnail, check if images array exists and has items
          if (!imageSource && p.images) {
            if (Array.isArray(p.images) && p.images.length > 0) {
              imageSource = p.images[0];
            } else if (typeof p.images === 'string') {
              // If images is stored as JSON string, try to parse it
              try {
                const parsed = JSON.parse(p.images);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  imageSource = parsed[0];
                }
              } catch (e) {
                // If parsing fails, treat as single image URL
                imageSource = p.images;
              }
            }
          }
          
          const imageUrl = this.normalizeImageUrl(imageSource);
          if (imageUrl) {
            productImageMap.set(p.id, imageUrl);
            console.log(`📧 Product ${p.id} image: ${imageUrl}`);
          }
        });

        const enrichedItems = items.map(item => {
          if (item.product_id && productImageMap.has(item.product_id)) {
            const imageUrl = productImageMap.get(item.product_id);
            console.log(`📧 Enriching item ${item.product_name} with image: ${imageUrl}`);
            return {
              ...item,
              product_image: imageUrl,
              image: imageUrl,
              thumbnail: imageUrl,
            };
          } else if (item.product_id) {
            // Product exists but no image found - use reliable placeholder service
            const placeholder = 'https://placehold.co/400x400/00afef/white?text=Product+Image';
            console.log(`📧 Product ${item.product_id} has no image, using placeholder`);
            return {
              ...item,
              product_image: placeholder,
              image: placeholder,
              thumbnail: placeholder,
            };
          }
          return item;
        });

        return enrichedItems;
      } else {
        console.log('📧 No products found for image enrichment');
      }
    } catch (error) {
      console.error('📧 Error enriching order items with images:', error);
    }

    return items;
  }

  // Generate price breakdown HTML for emails
  private generatePriceBreakdownHtml({
    subtotal,
    discount,
    discountCode,
    tax,
    shipping,
    total,
  }: {
    subtotal: number;
    discount: number;
    discountCode: string | null;
    tax: number;
    shipping: number;
    total: number;
  }): string {
    // For admin notification template (table format)
    let html = `
      <tr>
        <td style="padding: 8px 0; text-align: right; color: #3A3A3A; font-size: 14px;"><strong>Subtotal:</strong></td>
        <td style="padding: 8px 0; text-align: right; color: #1A1A1A; font-size: 14px; font-weight: 500;">GHS ${subtotal.toFixed(2)}</td>
      </tr>
    `;

    if (discount > 0) {
      html += `
        <tr>
          <td style="padding: 8px 0; text-align: right; color: #22c55e; font-size: 14px;">
            <strong>Discount${discountCode ? ` (Code: ${discountCode})` : ''}:</strong>
          </td>
          <td style="padding: 8px 0; text-align: right; color: #22c55e; font-size: 14px; font-weight: 500;">-GHS ${discount.toFixed(2)}</td>
        </tr>
      `;
    }

    if (tax > 0) {
      html += `
        <tr>
          <td style="padding: 8px 0; text-align: right; color: #3A3A3A; font-size: 14px;"><strong>Tax:</strong></td>
          <td style="padding: 8px 0; text-align: right; color: #1A1A1A; font-size: 14px; font-weight: 500;">GHS ${tax.toFixed(2)}</td>
        </tr>
      `;
    }

    if (shipping > 0) {
      html += `
        <tr>
          <td style="padding: 8px 0; text-align: right; color: #3A3A3A; font-size: 14px;"><strong>Delivery Charges:</strong></td>
          <td style="padding: 8px 0; text-align: right; color: #1A1A1A; font-size: 14px; font-weight: 500;">GHS ${shipping.toFixed(2)}</td>
        </tr>
      `;
    }

    html += `
      <tr>
        <td style="padding: 12px 0 0 0; border-top: 2px solid #e0e0e0; text-align: right; font-size: 16px; font-weight: bold; color: #1A1A1A;"><strong>Grand Total:</strong></td>
        <td style="padding: 12px 0 0 0; border-top: 2px solid #e0e0e0; text-align: right; font-size: 18px; color: #00afef; font-weight: bold;">GHS ${total.toFixed(2)}</td>
      </tr>
    `;

    return html;
  }

  private normalizeImageUrl(imageUrl?: string | null): string {
    // Use reliable placeholder service that always works
    const placeholder = 'https://placehold.co/400x400/00afef/white?text=Product+Image';
    
    if (!imageUrl || typeof imageUrl !== 'string') {
      console.log('📧 normalizeImageUrl: No image URL provided, using placeholder');
      return placeholder;
    }

    let url = imageUrl.trim();
    if (!url) {
      console.log('📧 normalizeImageUrl: Empty URL after trim, using placeholder');
      return placeholder;
    }

    if (url.startsWith('data:')) {
      console.log('📧 normalizeImageUrl: Data URL detected, returning as-is');
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
        const original = parsed.searchParams.get('url');
        if (original) {
          console.log('📧 normalizeImageUrl: Found Next.js image URL, extracting original:', original);
          return this.normalizeImageUrl(decodeURIComponent(original));
        }
      }
      console.log('📧 normalizeImageUrl: Valid URL, returning:', parsed.href);
      return parsed.href;
    } catch (error) {
      console.log('📧 normalizeImageUrl: URL parsing failed, normalizing:', url);
      if (url.startsWith('//')) {
        const normalized = `https:${url}`;
        console.log('📧 normalizeImageUrl: Protocol-relative URL, normalized to:', normalized);
        return normalized;
      }
      if (url.startsWith('/')) {
        const normalized = `${normalizedFrontendBase}${url}`;
        console.log('📧 normalizeImageUrl: Relative URL, normalized to:', normalized);
        return normalized;
      }
      if (!/^https?:\/\//i.test(url)) {
        const normalized = `${r2Base}/${url.replace(/^\//, '')}`;
        console.log('📧 normalizeImageUrl: Relative path, normalized to:', normalized);
        return normalized;
      }
      console.log('📧 normalizeImageUrl: Returning URL as-is:', url);
      return url;
    }
  }

  // Send admin order notification email
  async sendAdminOrderNotification(orderData: any): Promise<{ success: boolean; reason?: string }> {
    try {
      // Fetch product images for order items
      let orderItems = orderData.items || [];
      if (orderItems.length > 0) {
        orderItems = await this.enrichOrderItemsWithImages(orderItems);
      }

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
              .header { background: #00afef; color: white; padding: 20px; text-align: center; }
              .content { background: #f9f9f9; padding: 20px; }
              .order-info { background: white; padding: 15px; margin: 15px 0; border-left: 4px solid #00afef; }
              .item { padding: 10px; border-bottom: 1px solid #eee; }
              .total { font-size: 18px; font-weight: bold; color: #00afef; margin-top: 20px; }
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
                {{PRICE_BREAKDOWN}}
                <p><strong>Delivery Address:</strong></p>
                <p>{{DELIVERY_ADDRESS}}</p>
              </div>
            </div>
          </body>
          </html>
        `;
      }

      // Calculate price breakdown
      const subtotal = orderData.subtotal || 0;
      const discountAmount = orderData.discount || 0;
      const discountCode = orderData.discount_code || null;
      const taxAmount = orderData.tax || 0;
      const shippingFee = orderData.shipping_fee || orderData.delivery_fee || 0;
      const total = orderData.total || 0;

      // Generate price breakdown HTML
      const priceBreakdownHtml = this.generatePriceBreakdownHtml({
        subtotal,
        discount: discountAmount,
        discountCode,
        tax: taxAmount,
        shipping: shippingFee,
        total,
      });

      // Replace placeholders
      template = template
        .replace(/{{ORDER_NUMBER}}/g, orderData.order_number)
        .replace(/{{CUSTOMER_NAME}}/g, orderData.customer_name || 'Guest Customer')
        .replace(/{{CUSTOMER_EMAIL}}/g, orderData.customer_email || 'No email')
        .replace(/{{ORDER_DATE}}/g, new Date(orderData.created_at).toLocaleString())
        .replace(/{{TOTAL_AMOUNT}}/g, total.toFixed(2))
        .replace(/{{DELIVERY_ADDRESS}}/g, this.formatAddress(orderData.delivery_address))
        .replace(/{{ITEMS_LIST}}/g, this.formatOrderItemsAsTableRows(orderItems))
        .replace(/{{PRICE_BREAKDOWN}}/g, priceBreakdownHtml)
        .replace(/{{ORDER_NOTES}}/g, orderData.notes ? `<div style="background-color: #f9f9f9; border-radius: 8px; padding: 15px; margin: 20px 0;"><h3 style="color: #1A1A1A; font-size: 16px; margin: 0 0 10px 0;">Order Notes:</h3><p style="color: #3A3A3A; font-size: 14px; margin: 0;">${orderData.notes}</p></div>` : '');

      // Use support email for admin notifications (they can reply)
      // Send TO hedgehog.technologies1@gmail.com but FROM support@hogtechgh.com
      const success = await this.sendEmail({
        to: 'hedgehog.technologies1@gmail.com',
        subject: `New Order Received - ${orderData.order_number}`,
        html: template,
      }, true); // true = use support email (FROM support@hogtechgh.com)

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
        subject: 'Verify Your Email - Hogtech',
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
        subject: 'Reset Your Password - Hogtech',
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
          <title>New Investment Request - Hogtech</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #FF7A19;">New Investment Request - Hogtech Laptop Banking</h2>
            
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
            
            <p>This investment request was submitted through the Hogtech website.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
              <p>Hedgehog Technologies - Your Trusted Tech Partner</p>
              <p>Email: support@hogtechgh.com | Phone: +233 55 134 4310</p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Use support email for investment requests (admin can reply)
      const success = await this.sendEmail({
        to: 'support@hogtechgh.com',
        subject: `New Investment Request - ${fullName}`,
        html: html,
      }, true); // true = use support email

      return { success };
    } catch (error) {
      console.error('Error sending investment email:', error);
      return { success: false, error: 'Failed to send investment email' };
    }
  }

  // Send return request confirmation email to customer
  async sendReturnRequestConfirmationEmail(data: {
    returnRequestId: string;
    orderNumber: string;
    reason: string;
    customerEmail: string | null;
    customerName?: string;
    orderItems?: any[];
    orderTotal?: number;
    orderDate?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!data.customerEmail) {
      // Guest customers - skip email
      return { success: true, error: 'No customer email provided' };
    }

    try {
      const orderItemsHtml = data.orderItems && data.orderItems.length > 0
        ? this.formatOrderItemsForEmail(data.orderItems)
        : '<p>Order items information not available.</p>';

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Return Request Received - ${data.orderNumber}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #00afef; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0;">Return Request Received</h1>
            </div>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px;">
              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <p>Dear ${data.customerName || 'Customer'},</p>
                <p>We have received your return request for <strong>Order #${data.orderNumber}</strong>.</p>
                
                <div style="background: #e3f2fd; border-left: 4px solid #00afef; padding: 15px; margin: 20px 0;">
                  <h3 style="color: #1A1A1A; margin-top: 0;">Return Request Details</h3>
                  <p><strong>Return Request ID:</strong> ${data.returnRequestId}</p>
                  <p><strong>Order Number:</strong> ${data.orderNumber}</p>
                  ${data.orderDate ? `<p><strong>Order Date:</strong> ${new Date(data.orderDate).toLocaleDateString()}</p>` : ''}
                  ${data.orderTotal ? `<p><strong>Order Total:</strong> GHS ${data.orderTotal.toFixed(2)}</p>` : ''}
                </div>

                <h3 style="color: #1A1A1A;">Order Items:</h3>
                <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0;">
                  ${orderItemsHtml}
                </div>

                <h3 style="color: #1A1A1A;">Reason for Return:</h3>
                <div style="background: #f0f0f0; padding: 15px; border-radius: 4px; margin: 15px 0;">
                  <p style="margin: 0;">${data.reason}</p>
                </div>

                <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                  <h3 style="color: #1A1A1A; margin-top: 0;">What Happens Next?</h3>
                  <ol style="color: #3A3A3A; margin: 0; padding-left: 20px;">
                    <li>Our team will review your return request (usually within 1-2 business days)</li>
                    <li>If approved, you'll receive a Return Authorization (RA) number via email</li>
                    <li>Follow the instructions in the approval email to complete your return</li>
                    <li>Once we receive and inspect your return, we'll process your refund</li>
                  </ol>
                </div>

                <p style="color: #3A3A3A;">You can track the status of your return request by checking your email or contacting our customer service team.</p>
              </div>
            </div>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center;">
              <p>Hedgehog Technologies - Your Trusted Tech Partner</p>
              <p>Email: support@hogtechgh.com | Phone: +233 553 886 5804</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const success = await this.sendEmail({
        to: data.customerEmail,
        subject: `Return Request Received - Order #${data.orderNumber}`,
        html,
      }, true);

      return { success };
    } catch (error) {
      console.error('Error sending return request confirmation email:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Send admin notification for new return request
  async sendAdminReturnRequestNotification(data: {
    returnRequestId: string;
    orderNumber: string;
    reason: string;
    customerEmail: string | null;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>New Return Request - ${data.orderNumber}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #00afef; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0;">New Return Request</h1>
            </div>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px;">
              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="color: #1A1A1A; margin-top: 0;">Return Request Details</h2>
                <p><strong>Return Request ID:</strong> ${data.returnRequestId}</p>
                <p><strong>Order Number:</strong> ${data.orderNumber}</p>
                <p><strong>Customer Email:</strong> ${data.customerEmail || 'Guest Customer'}</p>
                <p><strong>Reason for Return:</strong></p>
                <div style="background: #f0f0f0; padding: 15px; border-radius: 4px; margin-top: 10px;">
                  <p style="margin: 0;">${data.reason}</p>
                </div>
              </div>
              <p style="text-align: center; margin-top: 20px;">
                <a href="${process.env.FRONTEND_URL || 'https://hogtechgh.com'}/admin/returns" 
                   style="background: #00afef; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                  Review Return Request
                </a>
              </p>
            </div>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center;">
              <p>Hedgehog Technologies - Admin Dashboard</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const success = await this.sendEmail({
        to: 'hedgehog.technologies1@gmail.com',
        subject: `New Return Request - ${data.orderNumber}`,
        html,
      }, true);

      return { success };
    } catch (error) {
      console.error('Error sending admin return request notification:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Send return authorization email to customer
  async sendReturnAuthorizationEmail(data: {
    returnRequestId: string;
    raNumber: string;
    orderNumber: string;
    returnAddress: string;
    customerEmail: string | null;
    customerName?: string;
    orderItems?: any[];
    orderTotal?: number;
    orderDate?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!data.customerEmail) {
      return { success: false, error: 'Customer email is required' };
    }

    try {
      const orderItemsHtml = data.orderItems && data.orderItems.length > 0
        ? this.formatOrderItemsForEmail(data.orderItems)
        : '<p>Order items information not available.</p>';

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Return Authorization - ${data.raNumber}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #00afef; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0;">Return Authorization Approved</h1>
            </div>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px;">
              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <p>Dear ${data.customerName || 'Customer'},</p>
                <p>Your return request for <strong>Order #${data.orderNumber}</strong> has been approved!</p>
                
                <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 20px 0;">
                  <h3 style="color: #1A1A1A; margin-top: 0;">Return Authorization Number</h3>
                  <p style="font-size: 24px; font-weight: bold; color: #00afef; margin: 10px 0;">${data.raNumber}</p>
                  <p style="margin: 0; font-size: 12px; color: #666;">Please include this RA number in your return package</p>
                </div>

                <h3 style="color: #1A1A1A;">Order Details:</h3>
                <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0;">
                  <p><strong>Order Number:</strong> ${data.orderNumber}</p>
                  ${data.orderDate ? `<p><strong>Order Date:</strong> ${new Date(data.orderDate).toLocaleDateString()}</p>` : ''}
                  ${data.orderTotal ? `<p><strong>Order Total:</strong> GHS ${data.orderTotal.toFixed(2)}</p>` : ''}
                </div>

                <h3 style="color: #1A1A1A;">Items Being Returned:</h3>
                <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0;">
                  ${orderItemsHtml}
                </div>

                <h3 style="color: #1A1A1A;">Return Instructions:</h3>
                <ol style="color: #3A3A3A;">
                  <li>Carefully pack the item in its original packaging with all accessories, manuals, and tags</li>
                  <li>Include a copy of your invoice and write the RA number <strong>${data.raNumber}</strong> on the package</li>
                  <li>Ship the package to the address below, or drop it off at our office in Accra</li>
                </ol>

                <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                  <h3 style="color: #1A1A1A; margin-top: 0;">Return Address:</h3>
                  <p style="margin: 0; color: #3A3A3A;">${data.returnAddress}</p>
                </div>

                <p style="color: #3A3A3A;">Once we receive and inspect your return (1-2 business days), we'll process your refund within 5-7 business days to your original payment method.</p>
              </div>
            </div>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center;">
              <p>Hedgehog Technologies - Your Trusted Tech Partner</p>
              <p>Email: support@hogtechgh.com | Phone: +233 553 886 5804</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const success = await this.sendEmail({
        to: data.customerEmail,
        subject: `Return Authorization Approved - ${data.raNumber}`,
        html,
      }, true);

      return { success };
    } catch (error) {
      console.error('Error sending return authorization email:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Send return rejection email to customer
  async sendReturnRejectionEmail(data: {
    returnRequestId: string;
    orderNumber: string;
    rejectionReason: string;
    customerEmail: string | null;
    customerName?: string;
    orderItems?: any[];
    orderTotal?: number;
    orderDate?: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!data.customerEmail) {
      return { success: false, error: 'Customer email is required' };
    }

    try {
      const orderItemsHtml = data.orderItems && data.orderItems.length > 0
        ? this.formatOrderItemsForEmail(data.orderItems)
        : '<p>Order items information not available.</p>';

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Return Request Update - ${data.orderNumber}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0;">Return Request Update</h1>
            </div>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px;">
              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <p>Dear ${data.customerName || 'Customer'},</p>
                <p>We regret to inform you that your return request for <strong>Order #${data.orderNumber}</strong> has been declined.</p>
                
                <h3 style="color: #1A1A1A;">Order Details:</h3>
                <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0;">
                  <p><strong>Order Number:</strong> ${data.orderNumber}</p>
                  ${data.orderDate ? `<p><strong>Order Date:</strong> ${new Date(data.orderDate).toLocaleDateString()}</p>` : ''}
                  ${data.orderTotal ? `<p><strong>Order Total:</strong> GHS ${data.orderTotal.toFixed(2)}</p>` : ''}
                </div>

                <h3 style="color: #1A1A1A;">Order Items:</h3>
                <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0;">
                  ${orderItemsHtml}
                </div>
                
                <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0;">
                  <h3 style="color: #1A1A1A; margin-top: 0;">Reason for Rejection:</h3>
                  <p style="margin: 0; color: #3A3A3A;">${data.rejectionReason}</p>
                </div>

                <p style="color: #3A3A3A;">If you have any questions or concerns about this decision, please contact our customer service team:</p>
                <ul style="color: #3A3A3A;">
                  <li>Email: <a href="mailto:hedgehog.technologies1@gmail.com" style="color: #00afef;">hedgehog.technologies1@gmail.com</a></li>
                  <li>Phone: <a href="tel:+2335538865804" style="color: #00afef;">+233 553 886 5804</a></li>
                </ul>
              </div>
            </div>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center;">
              <p>Hedgehog Technologies - Your Trusted Tech Partner</p>
              <p>Email: support@hogtechgh.com | Phone: +233 553 886 5804</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const success = await this.sendEmail({
        to: data.customerEmail,
        subject: `Return Request Update - ${data.orderNumber}`,
        html,
      }, true);

      return { success };
    } catch (error) {
      console.error('Error sending return rejection email:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Send return status update email (for processing, completed, etc.)
  async sendReturnStatusUpdateEmail(data: {
    returnRequestId: string;
    orderNumber: string;
    status: string;
    raNumber?: string | null;
    customerEmail: string | null;
    customerName?: string;
    orderItems?: any[];
    orderTotal?: number;
    orderDate?: string;
    adminNotes?: string | null;
  }): Promise<{ success: boolean; error?: string }> {
    if (!data.customerEmail) {
      return { success: true, error: 'No customer email provided' };
    }

    try {
      const statusMessages: Record<string, { title: string; color: string; bgColor: string; message: string }> = {
        processing: {
          title: 'Return Processing',
          color: '#00afef',
          bgColor: '#e3f2fd',
          message: 'Your return is being processed. We have received your returned item and are currently inspecting it.',
        },
        completed: {
          title: 'Return Completed',
          color: '#4caf50',
          bgColor: '#e8f5e9',
          message: 'Your return has been completed! Your refund has been processed and will appear in your account within 5-7 business days.',
        },
        cancelled: {
          title: 'Return Cancelled',
          color: '#666',
          bgColor: '#f5f5f5',
          message: 'Your return request has been cancelled.',
        },
      };

      const statusInfo = statusMessages[data.status] || {
        title: 'Return Status Update',
        color: '#00afef',
        bgColor: '#e3f2fd',
        message: `Your return request status has been updated to: ${data.status}`,
      };

      const orderItemsHtml = data.orderItems && data.orderItems.length > 0
        ? this.formatOrderItemsForEmail(data.orderItems)
        : '<p>Order items information not available.</p>';

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Return Status Update - ${data.orderNumber}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: ${statusInfo.color}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0;">${statusInfo.title}</h1>
            </div>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px;">
              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <p>Dear ${data.customerName || 'Customer'},</p>
                <p>Your return request for <strong>Order #${data.orderNumber}</strong> status has been updated.</p>
                
                ${data.raNumber ? `
                <div style="background: ${statusInfo.bgColor}; border-left: 4px solid ${statusInfo.color}; padding: 15px; margin: 20px 0;">
                  <h3 style="color: #1A1A1A; margin-top: 0;">Return Authorization Number</h3>
                  <p style="font-size: 20px; font-weight: bold; color: ${statusInfo.color}; margin: 10px 0;">${data.raNumber}</p>
                </div>
                ` : ''}

                <div style="background: ${statusInfo.bgColor}; border-left: 4px solid ${statusInfo.color}; padding: 15px; margin: 20px 0;">
                  <h3 style="color: #1A1A1A; margin-top: 0;">Status Update</h3>
                  <p style="margin: 0; color: #3A3A3A;">${statusInfo.message}</p>
                </div>

                <h3 style="color: #1A1A1A;">Order Details:</h3>
                <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0;">
                  <p><strong>Order Number:</strong> ${data.orderNumber}</p>
                  ${data.orderDate ? `<p><strong>Order Date:</strong> ${new Date(data.orderDate).toLocaleDateString()}</p>` : ''}
                  ${data.orderTotal ? `<p><strong>Order Total:</strong> GHS ${data.orderTotal.toFixed(2)}</p>` : ''}
                </div>

                <h3 style="color: #1A1A1A;">Order Items:</h3>
                <div style="background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0;">
                  ${orderItemsHtml}
                </div>

                ${data.adminNotes ? `
                <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
                  <h3 style="color: #1A1A1A; margin-top: 0;">Additional Notes:</h3>
                  <p style="margin: 0; color: #3A3A3A;">${data.adminNotes}</p>
                </div>
                ` : ''}

                <p style="color: #3A3A3A;">If you have any questions, please contact our customer service team:</p>
                <ul style="color: #3A3A3A;">
                  <li>Email: <a href="mailto:hedgehog.technologies1@gmail.com" style="color: #00afef;">hedgehog.technologies1@gmail.com</a></li>
                  <li>Phone: <a href="tel:+2335538865804" style="color: #00afef;">+233 553 886 5804</a></li>
                </ul>
              </div>
            </div>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center;">
              <p>Hedgehog Technologies - Your Trusted Tech Partner</p>
              <p>Email: support@hogtechgh.com | Phone: +233 553 886 5804</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const success = await this.sendEmail({
        to: data.customerEmail,
        subject: `Return Status Update - Order #${data.orderNumber}`,
        html,
      }, true);

      return { success };
    } catch (error) {
      console.error('Error sending return status update email:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

export default new EnhancedEmailService();
export { sendInvestmentEmail } from './email.service';
