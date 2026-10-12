-- What the receipt image says about itself (EXIF/XMP dates, software, device)
-- plus the file's last-modified time from the debtor's browser, as JSON — see
-- ReceiptMetadata in image-metadata.ts. NULL for receipts sent before this.
ALTER TABLE payments ADD COLUMN receipt_meta TEXT;
