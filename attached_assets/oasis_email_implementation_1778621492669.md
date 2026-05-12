# Oasis Garden & Patio — Order Status Email Implementation
## Resend API Integration for Replit

---

## 1. Add Your Resend API Key

In your Replit project, open **Secrets** (the padlock icon in the sidebar) and add:

| Key | Value |
|-----|-------|
| `RESEND_API_KEY` | `your_resend_api_key_here` |

---

## 2. Create the Email Service File

Create a new file: `services/emailService.js`

```javascript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = 'Oasis Garden & Patio <orders@yourdomain.com>';

const templates = {
  pending: (customerName, orderId) => ({
    subject: `We received your order! (${orderId})`,
    html: `
      <p>Hi ${customerName},</p>
      <p>Thank you for your order with Oasis Garden & Patio! We've received your order <strong>${orderId}</strong> and it's currently being reviewed by our team.</p>
      <p>If you have any questions in the meantime, feel free to reply to this email.</p>
      <p>Warm regards,<br/>The Oasis Garden & Patio Team</p>
    `
  }),

  confirmed: (customerName, orderId) => ({
    subject: `Your order is confirmed! (${orderId})`,
    html: `
      <p>Hi ${customerName},</p>
      <p>Great news! Your order <strong>${orderId}</strong> has been confirmed and is now in our system. Our team will begin working on it soon.</p>
      <p>Thank you for choosing Oasis Garden & Patio!</p>
      <p>Warm regards,<br/>The Oasis Garden & Patio Team</p>
    `
  }),

  in_production: (customerName, orderId) => ({
    subject: `Your order is being made! (${orderId})`,
    html: `
      <p>Hi ${customerName},</p>
      <p>Your order <strong>${orderId}</strong> is now in production! Our team is hard at work crafting your items.</p>
      <p>Thank you for your patience!</p>
      <p>Warm regards,<br/>The Oasis Garden & Patio Team</p>
    `
  }),

  ready_for_delivery: (customerName, orderId) => ({
    subject: `Your order is ready! (${orderId})`,
    html: `
      <p>Hi ${customerName},</p>
      <p>Your order <strong>${orderId}</strong> is complete and ready for delivery! Our team will be in touch shortly to coordinate a delivery time that works for you.</p>
      <p>If you have a preferred time window or any special instructions, feel free to reply to this email.</p>
      <p>We can't wait for you to enjoy your new pieces!</p>
      <p>Warm regards,<br/>The Oasis Garden & Patio Team</p>
    `
  }),

  out_for_delivery: (customerName, orderId) => ({
    subject: `Your order is on its way! (${orderId})`,
    html: `
      <p>Hi ${customerName},</p>
      <p>Exciting news! Your order <strong>${orderId}</strong> is out for delivery today. Please ensure someone is available to receive it at your delivery address.</p>
      <p>If you have any questions or need to reach us urgently, please reply to this email or call us directly.</p>
      <p>We hope you love your new items!</p>
      <p>Warm regards,<br/>The Oasis Garden & Patio Team</p>
    `
  }),

  delivered: (customerName, orderId) => ({
    subject: `Your order has been delivered! (${orderId})`,
    html: `
      <p>Hi ${customerName},</p>
      <p>Your order <strong>${orderId}</strong> has been delivered! We hope everything arrived in perfect condition.</p>
      <p>If you have any concerns about your delivery or would like to share feedback, please don't hesitate to reach out. We'd love to hear from you!</p>
      <p>Thank you for shopping with Oasis Garden & Patio.</p>
      <p>Warm regards,<br/>The Oasis Garden & Patio Team</p>
    `
  }),

  completed: (customerName, orderId) => ({
    subject: `Your order is complete! (${orderId})`,
    html: `
      <p>Hi ${customerName},</p>
      <p>Your order <strong>${orderId}</strong> is now marked as complete. We truly appreciate your business and hope you're enjoying your new pieces from Oasis Garden & Patio.</p>
      <p>If you ever need anything in the future, we're always here to help. We'd also love it if you shared a photo of your space!</p>
      <p>Thank you again for choosing us.</p>
      <p>Warm regards,<br/>The Oasis Garden & Patio Team</p>
    `
  }),

  canceled: (customerName, orderId) => ({
    subject: `Your order has been canceled (${orderId})`,
    html: `
      <p>Hi ${customerName},</p>
      <p>We're writing to let you know that your order <strong>${orderId}</strong> has been canceled. If you did not request this cancellation or have any questions, please reach out to us right away.</p>
      <p>If a payment was made, any applicable refund will be processed within 5 to 7 business days.</p>
      <p>We hope to have the opportunity to serve you again in the future.</p>
      <p>Warm regards,<br/>The Oasis Garden & Patio Team</p>
    `
  }),

  refunded: (customerName, orderId) => ({
    subject: `Your refund has been processed (${orderId})`,
    html: `
      <p>Hi ${customerName},</p>
      <p>Your refund for order <strong>${orderId}</strong> has been processed. Depending on your bank or payment provider, it may take 5 to 7 business days for the funds to appear in your account.</p>
      <p>If you have any questions about your refund or would like to discuss your order further, please don't hesitate to contact us.</p>
      <p>Thank you for your understanding, and we hope to serve you again.</p>
      <p>Warm regards,<br/>The Oasis Garden & Patio Team</p>
    `
  }),
};

// Map status values from the DB to template keys
const STATUS_MAP = {
  'pending':            'pending',
  'confirmed':          'confirmed',
  'in production':      'in_production',
  'ready for delivery': 'ready_for_delivery',
  'out for delivery':   'out_for_delivery',
  'delivered':          'delivered',
  'completed':          'completed',
  'canceled':           'canceled',
  'refunded':           'refunded',
};

/**
 * Send an order status email to a customer.
 *
 * @param {string} toEmail       - Customer's email address
 * @param {string} customerName  - Customer's display name
 * @param {string} orderId       - Order ID (e.g. ORD-MOOXFBUD-FKJ8)
 * @param {string} status        - New order status string from the DB
 * @returns {Promise<object>}    - Resend API response
 */
export async function sendOrderStatusEmail(toEmail, customerName, orderId, status) {
  const templateKey = STATUS_MAP[status.toLowerCase()];

  if (!templateKey || !templates[templateKey]) {
    console.warn(`No email template found for status: "${status}"`);
    return null;
  }

  const { subject, html } = templates[templateKey](customerName, orderId);

  try {
    const response = await resend.emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject,
      html,
    });

    console.log(`Order status email sent for ${orderId} (${status}):`, response.id);
    return response;
  } catch (error) {
    console.error(`Failed to send order status email for ${orderId}:`, error);
    throw error;
  }
}
```

---

## 3. Hook Into Your Order Status Update Route

In whichever route or controller handles order status changes (likely something like `routes/orders.js` or `controllers/orderController.js`), import and call the email service:

```javascript
import { sendOrderStatusEmail } from '../services/emailService.js';

// Inside your PATCH /orders/:id/status handler, after saving the new status:

const order = await Order.findById(req.params.id).populate('customer');

await updateOrderStatus(order, newStatus); // your existing save logic

// Send the status email if the customer has an email address
if (order.customer?.email) {
  await sendOrderStatusEmail(
    order.customer.email,
    order.customer.name,
    order.id,         // e.g. ORD-MOOXFBUD-FKJ8
    newStatus         // e.g. "confirmed"
  );
}
```

> **Note:** The email is triggered only when the agent manually moves the status, so skipping a stage naturally means no email is sent for it. No extra logic is needed.

---

## 4. Quick Test

You can test a single email from the Replit Shell without touching any orders:

```javascript
// test-email.js  (run once with: node test-email.js)
import { sendOrderStatusEmail } from './services/emailService.js';

await sendOrderStatusEmail(
  'your@email.com',
  'Test Customer',
  'ORD-TEST-0001',
  'confirmed'
);

console.log('Test email sent!');
```

---

## Summary of Files Changed

| File | Action |
|------|--------|
| `services/emailService.js` | Create (new file with all templates) |
| `routes/orders.js` or equivalent | Edit (add email trigger after status save) |
| Replit Secrets | Add `RESEND_API_KEY` |

> **Note:** The `FROM_ADDRESS` is currently set to Resend's default test sender. Update it to your verified domain email once you're ready to go live.
