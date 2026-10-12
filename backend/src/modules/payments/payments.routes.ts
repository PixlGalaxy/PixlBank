import { Router, type Request } from 'express';
import busboy from 'busboy';
import type { Translate } from '../../i18n/index.js';
import type { EnvConfig } from '../../config/env.js';
import type { AuthenticatedRequest } from '../auth/session.middleware.js';
import { createAuthGuards } from '../auth/session.middleware.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { createRateLimiter, type RateLimiter } from '../../middleware/rate-limit.js';
import { routeParam } from '../../route-params.js';
import { badRequest, forbidden, type AppError } from '../../errors.js';
import { SERVE_OPTIONS } from '../../serve-options.js';
import { toCents } from '../loans/loans.service.js';
import { RECEIPT_EXT_BY_MIME, type PaymentsService } from './payments.service.js';
import { sniffImage, uploadResponseHeaders } from '../../image-sniff.js';

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

interface ParsedReport {
  fields: Record<string, string>;
  receipt: { buffer: Buffer; mime: string } | null;
}

/** The browser's File.lastModified (ms since epoch); anything implausible is dropped. */
function parseFileModified(value: string | undefined): number | null {
  const ms = Number(value);
  return Number.isInteger(ms) && ms > Date.UTC(2000, 0, 1) && ms < Date.now() + 86_400_000 ? ms : null;
}

/** Reads the whole multipart body into memory — receipts are small and Ollama needs the bytes anyway. */
function parseReport(req: Request): Promise<ParsedReport> {
  return new Promise((resolve, reject) => {
    let parser: busboy.Busboy;
    try {
      parser = busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_RECEIPT_BYTES, fields: 10 } });
    } catch {
      reject(badRequest('payments.receiptRequired'));
      return;
    }
    const fields: Record<string, string> = {};
    let receipt: ParsedReport['receipt'] = null;
    let failure: AppError | null = null;

    parser.on('field', (name, value) => {
      fields[name] = value;
    });
    parser.on('file', (_field, stream, info) => {
      if (!RECEIPT_EXT_BY_MIME[info.mimeType]) {
        failure = badRequest('payments.receiptInvalidType');
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('limit', () => {
        failure = badRequest('payments.receiptTooLarge');
      });
      stream.on('end', () => {
        if (failure) return;
        const buffer = Buffer.concat(chunks);
        // Trust the bytes, not the browser: the stored type is what the file really is.
        const real = sniffImage(buffer);
        if (!real || !RECEIPT_EXT_BY_MIME[real]) {
          failure = badRequest('payments.receiptInvalidType');
          return;
        }
        receipt = { buffer, mime: real };
      });
    });
    parser.on('error', reject);
    parser.on('close', () => (failure ? reject(failure) : resolve({ fields, receipt })));
    req.pipe(parser);
  });
}

export function createPaymentsRoutes(
  t: Translate,
  config: EnvConfig,
  payments: PaymentsService,
): { router: Router; receiptIpLimiter: RateLimiter } {
  const router = Router();
  const { requireAuth, requireAdmin } = createAuthGuards(t);

  // Every report costs a vision-model run, so a misbehaving client can't queue hundreds.
  const receiptIpLimiter = createRateLimiter({
    windowMs: config.RECEIPT_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    max: config.RECEIPT_RATE_LIMIT_MAX,
    keyFn: (req) => `ip:${req.ip}`,
    describe: (req) => `payment receipts from ${req.ip}`,
  });

  router.use(requireAuth);

  router.post(
    '/report',
    receiptIpLimiter.middleware,
    asyncHandler(async (req, res) => {
      const user = (req as AuthenticatedRequest).user!;
      // The lender registers payments directly; only debtors report them.
      if (user.role === 'admin') throw forbidden();
      const { fields, receipt } = await parseReport(req);
      const result = await payments.report(
        user,
        fields.loanId ?? '',
        toCents(fields.amount),
        fields.paidOn,
        fields.note,
        receipt && { ...receipt, fileModifiedMs: parseFileModified(fields.fileModified) },
      );
      res.status(201).json(result);
    }),
  );

  router.get('/:id/receipt', (req: AuthenticatedRequest, res, next) => {
    const { path, mime } = payments.receiptFile(routeParam(req.params.id), req.user!);
    for (const [name, value] of Object.entries(uploadResponseHeaders(mime))) res.setHeader(name, value);
    // Browser-only cache (never a shared proxy): receipts are confidential.
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(path, SERVE_OPTIONS, (err) => {
      if (err) next(err);
    });
  });

  router.use(requireAdmin);

  router.post(
    '/:id/review',
    asyncHandler(async (req, res) => {
      const { decision, note } = req.body as { decision?: unknown; note?: unknown };
      res.json(await payments.review((req as AuthenticatedRequest).user!, routeParam(req.params.id), decision, note));
    }),
  );

  // Queued like a new report; the result shows up on the payment when the model is done.
  router.post('/:id/verify', (req, res) => {
    payments.reverify(routeParam(req.params.id));
    res.status(202).json({ success: true });
  });

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      await payments.remove(routeParam(req.params.id), (req as AuthenticatedRequest).user!);
      res.status(204).end();
    }),
  );

  return { router, receiptIpLimiter };
}
