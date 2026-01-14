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

---

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or Bun
- Supabase account and project

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd AmericanRibsAndWings-restaurant-orderbox
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   bun install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
   ```
   
   Get these values from your Supabase project dashboard: **Settings → API**

4. **Run the development server**
   ```bash
   npm run dev
   ```
   
   The app will be available at http://localhost:8080

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build for development
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

For detailed setup instructions, see [SETUP.md](./SETUP.md)

---