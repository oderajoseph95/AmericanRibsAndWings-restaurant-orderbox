-- Fix sms_logs foreign key constraint to allow order deletion
ALTER TABLE sms_logs 
  DROP CONSTRAINT sms_logs_order_id_fkey;

ALTER TABLE sms_logs 
  ADD CONSTRAINT sms_logs_order_id_fkey 
  FOREIGN KEY (order_id) 
  REFERENCES orders(id) 
  ON DELETE SET NULL;

-- Fix abandoned_checkouts foreign key constraint to allow order deletion
ALTER TABLE abandoned_checkouts 
  DROP CONSTRAINT abandoned_checkouts_converted_order_id_fkey;

ALTER TABLE abandoned_checkouts 
  ADD CONSTRAINT abandoned_checkouts_converted_order_id_fkey 
  FOREIGN KEY (converted_order_id) 
  REFERENCES orders(id) 
  ON DELETE SET NULL;