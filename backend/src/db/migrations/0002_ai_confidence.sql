-- The AI no longer approves or rejects anything: it scores how trustworthy a
-- receipt looks (0-100) for the lender, who always makes the final call.
ALTER TABLE payments ADD COLUMN ai_confidence INTEGER;
-- The model's own one-line remark about the image (edited-looking, cropped...).
ALTER TABLE payments ADD COLUMN ai_notes TEXT;
-- Payments that were auto-approved/rejected by the old flow go back to the lender.
UPDATE payments SET status = 'pending', reviewed_at = NULL
  WHERE source = 'debtor' AND reviewed_by IS NULL AND status != 'pending';
DELETE FROM app_settings WHERE key = 'receipt_auto_approve';
