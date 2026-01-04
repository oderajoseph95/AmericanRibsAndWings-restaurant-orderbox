-- Allow Owner to delete orders and related records
CREATE POLICY "Owner can delete orders"
  ON orders FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

-- Allow Owner to delete order_items
CREATE POLICY "Owner can delete order_items"
  ON order_items FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

-- Allow Owner to delete order_item_flavors
CREATE POLICY "Owner can delete order_item_flavors"
  ON order_item_flavors FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

-- Allow Owner to delete payment_proofs
CREATE POLICY "Owner can delete payment_proofs"
  ON payment_proofs FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

-- Allow Owner to delete delivery_photos
CREATE POLICY "Owner can delete delivery_photos"
  ON delivery_photos FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

-- Allow Owner to delete driver_earnings
CREATE POLICY "Owner can delete driver_earnings"
  ON driver_earnings FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

-- Allow Owner to delete stock_adjustments
CREATE POLICY "Owner can delete stock_adjustments"
  ON stock_adjustments FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

-- Allow Owner to delete driver_payouts
CREATE POLICY "Owner can delete driver_payouts"
  ON driver_payouts FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));