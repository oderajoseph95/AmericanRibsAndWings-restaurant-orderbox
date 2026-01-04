# American Ribs & Wings Floridablanca

Online Ordering & Admin System

**Live site:** https://arwfloridablanca.shop

---

## Overview

This repository contains the source code for the **American Ribs & Wings Floridablanca online ordering system**, built to support pickup and delivery orders with real-time distance-based delivery fees, payment verification, and a full admin dashboard.

The system is designed for a **single-branch restaurant operation in the Philippines**, with workflows aligned to local payment methods, delivery operations, and customer behavior.

---

## Core Features

### Customer Ordering

- Pickup and Delivery order types
- Google Maps–based delivery distance calculation
- Distance-based delivery fee computation
- Estimated delivery time calculation using prep time + travel time
- Mobile-first checkout experience with collapsible sections
- Required payment proof for delivery orders
- Cash payments supported for pickup orders below defined limits

### Payments

- GCash payments with QR code display
- Bank transfer payments with QR code and account details
- Payment proof upload and verification
- Cash allowed only for pickup orders under ₱500
- Delivery orders are fully cashless

### Notifications

- SMS notifications for order status updates
- Email receipts and order confirmations
- Backend-triggered transactional messaging

### Admin Panel

- Secure admin authentication
- Full product management
- Category and flavor management
- Flavor rules for wings and bundles
- Order review and payment verification
- Delivery fee visibility per order
- Stock tracking and low-stock alerts
- Sales and order reporting

---

## Technology Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui

### Backend and Services

- Google Maps APIs for distance and ETA calculation
- Email service for transactional emails
- SMS gateway for order notifications

---

## Delivery Fee Logic

- First 3 km: ₱39
- Additional distance: ₱15 per kilometer
- Billable distance is calculated using road distance
- Distance is floored, not rounded up
- Delivery fee is calculated only after address confirmation

---

## ETA Calculation

Estimated delivery time is calculated as:

- Fixed preparation time: 30 minutes
- Plus Google Maps travel time
- Displayed as a time range to account for real-world conditions

**Example:**
