# Agent Brief 1 of 5 -- Email Copy Updates
Oasis Garden and Patio | From: Karen / Claude | July 2026

This brief covers text-only updates to existing email templates. No logic changes, no new templates, no database changes. Update the copy exactly as written below and check in with Karen when complete before moving to Brief 2.

---

## IMPORTANT RULES FOR THIS BRIEF

- Do not modify any email sending logic, triggers, or conditions.
- Do not modify any HTML structure, layout, button styles, or colors unless explicitly stated.
- Do not modify any templates not listed in this brief.
- Copy the new body text exactly as written. Spacing between paragraphs must be preserved as shown.
- All templates use the shared emailLayout from email.ts. Do not modify that layout.
- Check in with Karen after completing all updates in this brief before proceeding to Brief 2.

---

## 1. Customer Order Confirmation (orderConfirmationEmail.ts -- sendOrderConfirmationEmail)

### Subject line
OLD: `Your order has been placed! (${orderNumber})`
NEW: `Your order has been received! (${orderNumber})`

### Email title
OLD: `Order received`
NEW: `Order received`
(no change to title)

### Body
Replace the entire body HTML with the following. Preserve all existing variables (name, orderNumber, itemsTable, totalsTable, orderUrl). The policy link must use the existing getSiteBaseUrl() function to build the URL dynamically.

```
Hi [name],

Thank you for your order with Oasis Garden & Patio! We have received it and will be in touch if we have any questions before it goes into production.

Please take a moment to review our Shipping, Returns and Cancellation Policy for information about your order.

[itemized line items table]
[totals table]

Questions? Reply to this email or call us at (661) 255-9909.

[View Order button -- green, existing style]

Warm regards,
The Oasis Garden & Patio Team
```

Implementation notes:
- "Please take a moment to review our Shipping, Returns and Cancellation Policy" -- the words "Shipping, Returns and Cancellation Policy" must be a hyperlink pointing to `${siteBaseUrl}/shipping-returns.pdf`
- There must be a full blank line (paragraph break) between the first sentence and the policy sentence
- The policy link must use getSiteBaseUrl() -- this ensures the correct domain is used in both the Replit environment and after launch on oasisgardenandpatio.com with no manual update required

---

## 2. Admin New Order Notification (orderConfirmationEmail.ts -- sendStoreNewOrderNotification)

### Subject line -- no change
### Email title -- no change

### Body
After the first sentence "A new customer order has been placed on the website." add the following block before the customer details table:

```
Please complete the following steps to process this order:

1. Review the order for accuracy (items, address, and pricing)
2. Update the order status to Confirmed
3. Review and send the purchase order to the vendor
```

Everything else in this email stays exactly as-is.

---

## 3. Order Status -- Confirmed (orderStatusEmail.ts -- TEMPLATES.confirmed)

### Subject line -- no change

### Body
Replace the entire body with:

```
[greeting]

Great news! Your order has been confirmed and has been submitted to the manufacturer.

Here is what you can expect next:

- The manufacturer will provide an estimated completion date. Please keep in mind that estimated dates are not guaranteed -- we will keep you informed along the way.
- Once your order is ready, we will follow up with delivery details so you know exactly when to expect it.

As always, if you have any questions in the meantime feel free to reply to this email or call us at (661) 255-9909.

Thank you for choosing Oasis Garden & Patio!

[SIGNOFF]
```

---

## 4. Order Status -- In Production (orderStatusEmail.ts -- TEMPLATES.in_production)

### Subject line -- no change

### Body
Replace the entire body with:

```
[greeting]

Your order is now in production with the manufacturer. We will keep you posted as it progresses.

As always, if you have any questions feel free to reply to this email or call us at (661) 255-9909.

Thank you for your patience!

[SIGNOFF]
```

---

## 5. Order Status -- Delivered (orderStatusEmail.ts -- TEMPLATES.delivered)

### Subject line -- no change

### Body
Replace the entire body with:

```
[greeting]

Your order has been delivered! We hope everything arrived in perfect condition.

If you have any concerns about your delivery, please do not hesitate to reach out. We are always happy to help.

If you are loving your new pieces, we would really appreciate it if you took a moment to share your experience. It means a lot to a small business like ours!

Leave us a review on Yelp: https://www.yelp.com/biz/oasis-garden-and-patio-santa-clarita

Thank you so much for shopping with Oasis Garden & Patio. We hope to see you again!

[SIGNOFF]
```

Implementation notes:
- "Leave us a review on Yelp" must be a hyperlink pointing to https://www.yelp.com/biz/oasis-garden-and-patio-santa-clarita
- Full paragraph breaks between every paragraph as shown above

---

## 6. Order Status -- Completed (orderStatusEmail.ts -- TEMPLATES.completed)

### Subject line -- no change

### Body
Replace the entire body with:

```
[greeting]

Your order is now complete and we hope you are absolutely loving your new pieces from Oasis Garden & Patio. We truly appreciate your business!

If you ever need anything in the future, we are always here to help.

We would love to see your new space! Share a photo and tag us on Facebook or Instagram.

Leave us a review on Yelp: https://www.yelp.com/biz/oasis-garden-and-patio-santa-clarita

Thank you again for choosing Oasis Garden & Patio. We hope to see you again soon!

[SIGNOFF]
```

Implementation notes:
- "Facebook" must be a hyperlink pointing to https://www.facebook.com/people/Oasis-Garden-Patio/100057549515695/
- "Instagram" must be a hyperlink pointing to https://www.instagram.com/oasisgardenandpatio/
- "Leave us a review on Yelp" must be a hyperlink pointing to https://www.yelp.com/biz/oasis-garden-and-patio-santa-clarita
- Full paragraph breaks between every paragraph as shown above

---

## 7. Customer Cushion Confirmation (cushionEmail.ts -- sendCustomerConfirmationEmail)

### Subject line -- no change

### Body
Replace the entire body with:

```
Hi [customerName],

Thank you for your cushion order with Oasis Garden & Patio! We have received your request and will be in touch shortly to confirm details and pricing.

Order number: [orderNumber]

Items: [itemSummary]

If you have any questions in the meantime, feel free to reply to this email or call us at (661) 255-9909.

Warm regards,
The Oasis Garden & Patio Team
```

Implementation notes:
- Remove all references to "custom cushion" or "replacement cushion" label -- just say "cushion order"
- Full paragraph breaks between sections as shown
- Warm regards signoff must match the exact style used in other customer emails (the shared SIGNOFF constant)

---

## 8. Admin Cushion Alert (cushionEmail.ts -- sendAdminAlertEmail)

### Subject line -- no change
### Email title -- no change

### Body
Two changes only:

1. Replace "A new custom / replacement cushion order has been submitted" with "A new cushion order has been submitted."

2. Replace the plain text anchor link "View in admin dashboard" with a styled navy button matching the style used in sendStoreNewOrderNotification in orderConfirmationEmail.ts. The button text should read "View in Admin Dashboard" and the link URL remains the existing detailUrl variable.

Everything else in this email stays exactly as-is.

---

## 9. Vendor PO Email (vendorOrderEmail.ts -- sendVendorOrderEmail)

### Subject line -- no change
### Email title -- no change

### Opening line
OLD: `Please see the purchase order details below. Kindly acknowledge receipt and provide an estimated delivery date.`
NEW: `Purchase order from Oasis Garden & Patio is attached. Please acknowledge receipt and provide an estimated delivery date at your earliest convenience.`

Everything else in this email stays exactly as-is.

---

## 10. Staff Recovery -- Request Received (recoveryEmail.ts -- sendRecoveryRequestedEmail)

### Subject line -- no change
### Email title -- no change

### Body
Replace the entire body with:

```
A recovery request has been submitted for your Oasis Garden & Patio staff account. Click the link below to proceed.

[Open Recovery Link button -- green, existing style]

If you did not request this, please contact your administrator immediately.

Warm regards,
The Oasis Garden & Patio Team
```

Implementation notes:
- Remove all timer language, delay references, and IP/browser details from this email
- The recovery link button must remain functional -- only the surrounding copy changes
- IP and browser details are moving to the new admin alert email covered in Brief 4

---

| Check in with Karen after completing all 10 updates above. Confirm each template was updated correctly and that no sending logic, triggers, or conditions were modified. Do not proceed to Brief 2 until Karen gives the go-ahead. |
