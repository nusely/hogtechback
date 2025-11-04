import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

interface OrderData {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  payment_status: string;
  subtotal: number;
  discount: number;
  tax: number;
  shipping_fee?: number;
  delivery_fee?: number; // Legacy support
  total: number;
  shipping_address?: any;
  delivery_address?: any; // Legacy support
  user?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
  order_items?: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price?: number;
    subtotal?: number; // Legacy support
    selected_variants?: any;
  }>;
  // Also support items field (for backward compatibility)
  items?: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price?: number;
    subtotal?: number;
    selected_variants?: any;
  }>;
}

class PDFService {
  async generateOrderPDF(orderData: OrderData): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        // Validate required data
        if (!orderData || !orderData.order_number) {
          throw new Error('Invalid order data: order_number is required');
        }

        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => {
          buffers.push(chunk);
        });

        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          resolve(pdfData);
        });

        doc.on('error', (error: Error) => {
          reject(error);
        });

        // Download logo first (async)
        try {
          await this.addHeader(doc);
        } catch (error) {
          // If header fails, continue without logo
          console.warn('Failed to load logo, using text fallback:', error);
          this.addHeaderFallback(doc);
        }
        
        // Order Information
        this.addOrderInfo(doc, orderData);
        
        // Customer Information
        this.addCustomerInfo(doc, orderData);
        
        // Order Items
        this.addOrderItems(doc, orderData);
        
        // Order Summary
        this.addOrderSummary(doc, orderData);
        
        // Footer
        this.addFooter(doc);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async addHeader(doc: any) {
    try {
      // Download logo from R2
      // Note: PDFKit supports JPEG, PNG, GIF. For WebP, we'll try to use it directly
      // If it fails, it will fallback to text
      const logoUrl = 'https://files.ventechgadgets.com/ventech_logo_1.webp';
      const logoResponse = await axios.get(logoUrl, { 
        responseType: 'arraybuffer',
        timeout: 5000 // 5 second timeout
      });
      const logoBuffer = Buffer.from(logoResponse.data);
      
      // Try to add logo image (60x60px at top left)
      // PDFKit may not support WebP directly, so we'll catch if it fails
      try {
        doc.image(logoBuffer, 50, 50, { width: 60, height: 60 });
      } catch (imageError) {
        // If WebP is not supported, try downloading PNG version if available
        // For now, we'll just skip the image and use text
        throw new Error('WebP format not supported by PDFKit');
      }
      
      // Company name next to logo
      doc.fontSize(24)
         .fillColor('#FF7A19')
         .text('VENTECH', 120, 55)
         .fontSize(12)
         .fillColor('#3A3A3A')
         .text('Gadgets & Electronics', 120, 80);
    } catch (error) {
      // If logo fails, use fallback
      throw error;
    }

    // Document Title
    doc.fontSize(18)
       .fillColor('#1A1A1A')
       .text('ORDER INVOICE', 50, 120);

    // Line separator
    doc.moveTo(50, 150)
       .lineTo(550, 150)
       .stroke('#EDEDED');
  }

  private addHeaderFallback(doc: any) {
    // Fallback to text if logo fails to load
    doc.fontSize(24)
       .fillColor('#FF7A19')
       .text('VENTECH', 50, 50)
       .fontSize(12)
       .fillColor('#3A3A3A')
       .text('Gadgets & Electronics', 50, 80);

    // Document Title
    doc.fontSize(18)
       .fillColor('#1A1A1A')
       .text('ORDER INVOICE', 50, 120);

    // Line separator
    doc.moveTo(50, 150)
       .lineTo(550, 150)
       .stroke('#EDEDED');
  }

  private addOrderInfo(doc: any, orderData: OrderData) {
    const y = 170;
    
    doc.fontSize(12)
       .fillColor('#1A1A1A')
       .text('Order Information', 50, y)
       .fontSize(10)
       .fillColor('#3A3A3A');

    const orderInfo = [
      ['Order Number:', orderData.order_number],
      ['Order Date:', new Date(orderData.created_at).toLocaleDateString()],
      ['Status:', orderData.status.toUpperCase()],
      ['Payment Status:', orderData.payment_status.toUpperCase()],
    ];

    let currentY = y + 20;
    orderInfo.forEach(([label, value]) => {
      doc.text(label, 50, currentY)
         .text(value, 200, currentY);
      currentY += 15;
    });
  }

  private addCustomerInfo(doc: any, orderData: OrderData) {
    const y = 280;
    
    doc.fontSize(12)
       .fillColor('#1A1A1A')
       .text('Customer Information', 50, y)
       .fontSize(10)
       .fillColor('#3A3A3A');

    const customerName = orderData.user 
      ? `${orderData.user.first_name || ''} ${orderData.user.last_name || ''}`.trim() || 'Unknown'
      : (orderData.shipping_address?.full_name || orderData.delivery_address?.full_name || 'Guest Customer');
    
    const customerEmail = orderData.user?.email || orderData.shipping_address?.email || orderData.delivery_address?.email || 'No email';
    const address = orderData.shipping_address || orderData.delivery_address;
    
    const customerInfo = [
      ['Name:', customerName],
      ['Email:', customerEmail],
      ['Address:', this.formatAddress(address)],
    ];

    let currentY = y + 20;
    customerInfo.forEach(([label, value]) => {
      doc.text(label, 50, currentY)
         .text(value, 200, currentY);
      currentY += 15;
    });
  }

  private addOrderItems(doc: any, orderData: OrderData) {
    const y = 380;
    
    doc.fontSize(12)
       .fillColor('#1A1A1A')
       .text('Order Items', 50, y);

    // Get order items - handle both order_items and items
    const items = orderData.order_items || (orderData as any).items || [];
    
    if (!items || items.length === 0) {
      doc.fontSize(10)
         .fillColor('#3A3A3A')
         .text('No items found', 50, y + 30);
      return;
    }

    // Table header
    const tableY = y + 20;
    doc.fontSize(10)
       .fillColor('#3A3A3A')
       .text('Product', 50, tableY)
       .text('Qty', 300, tableY)
       .text('Unit Price', 350, tableY)
       .text('Total', 450, tableY);

    // Table line
    doc.moveTo(50, tableY + 15)
       .lineTo(550, tableY + 15)
       .stroke('#EDEDED');

    // Order items
    let currentY = tableY + 25;
    items.forEach((item: any) => {
      const itemTotal = item.total_price || item.subtotal || (item.unit_price * item.quantity);
      doc.fillColor('#1A1A1A')
         .text(item.product_name || 'Unknown Product', 50, currentY)
         .text((item.quantity || 0).toString(), 300, currentY)
         .text(`GHS ${(item.unit_price || 0).toFixed(2)}`, 350, currentY)
         .text(`GHS ${itemTotal.toFixed(2)}`, 450, currentY);
      
      currentY += 20;
    });
  }

  private addOrderSummary(doc: any, orderData: OrderData) {
    const y = 500;
    
    doc.fontSize(12)
       .fillColor('#1A1A1A')
       .text('Order Summary', 400, y);

    const summaryY = y + 20;
    const summaryItems: Array<[string, string]> = [];
    
    summaryItems.push(['Subtotal:', `GHS ${orderData.subtotal.toFixed(2)}`]);
    
    if (orderData.discount > 0) {
      summaryItems.push(['Discount:', `-GHS ${orderData.discount.toFixed(2)}`]);
    }
    
    if (orderData.tax > 0) {
      summaryItems.push(['Tax:', `GHS ${orderData.tax.toFixed(2)}`]);
    }
    
    const shippingFee = orderData.shipping_fee || orderData.delivery_fee || 0;
    if (shippingFee > 0) {
      summaryItems.push(['Shipping Fee:', `GHS ${shippingFee.toFixed(2)}`]);
    }

    let currentY = summaryY;
    summaryItems.forEach(([label, value]) => {
      doc.fontSize(10)
         .fillColor('#3A3A3A')
         .text(label, 400, currentY)
         .text(value, 500, currentY);
      currentY += 15;
    });

    // Total line
    doc.moveTo(400, currentY + 5)
       .lineTo(550, currentY + 5)
       .stroke('#EDEDED');

    // Total
    doc.fontSize(12)
       .fillColor('#FF7A19')
       .text('TOTAL:', 400, currentY + 15)
       .text(`GHS ${orderData.total.toFixed(2)}`, 500, currentY + 15);
  }

  private addFooter(doc: any) {
    const y = 650;
    
    doc.fontSize(10)
       .fillColor('#3A3A3A')
       .text('Thank you for choosing VENTECH!', 50, y)
       .text('For support, contact us at support@ventechgadgets.com', 50, y + 15)
       .text('Phone: +233 55 134 4310', 50, y + 30)
       .text('Website: www.ventechgadgets.com', 50, y + 45);
  }

  private formatAddress(address: any): string {
    if (typeof address === 'string') return address;
    if (!address) return 'No address provided';
    
    const parts = [
      address.street_address || address.street,
      address.city,
      address.region,
      address.postal_code,
      address.country
    ].filter(Boolean);
    
    return parts.join(', ');
  }
}

export default new PDFService();
