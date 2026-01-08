-- Add new columns to sms_logs for tracking Semaphore status
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS semaphore_status text;
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS cost integer DEFAULT 1;
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();
ALTER TABLE sms_logs ADD COLUMN IF NOT EXISTS message_length integer;

-- Create index for faster lookup of pending messages
CREATE INDEX IF NOT EXISTS idx_sms_logs_message_id ON sms_logs(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_logs_semaphore_status ON sms_logs(semaphore_status);

-- Add comment explaining status columns
COMMENT ON COLUMN sms_logs.status IS 'Our internal status (sent/failed)';
COMMENT ON COLUMN sms_logs.semaphore_status IS 'Actual status from Semaphore API (Queued/Pending/Sent/Failed/Refunded)';