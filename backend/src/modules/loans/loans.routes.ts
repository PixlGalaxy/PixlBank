import { Router } from 'express';
import type { Translate } from '../../i18n/index.js';
import type { AuthenticatedRequest } from '../auth/session.middleware.js';
import { createAuthGuards } from '../auth/session.middleware.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { routeParam } from '../../route-params.js';
import { badRequest, notFound } from '../../errors.js';
import { logger } from '../../logger.js';
import { toCents, type LoanInput, type LoansService } from './loans.service.js';
import type { PaymentsService } from '../payments/payments.service.js';
import type { RemindersService } from '../mail/reminders.service.js';
import type { MailService } from '../mail/mail.service.js';
import type { ScoreService } from './score.service.js';

export function createLoansRoutes(
  t: Translate,
  loans: LoansService,
  payments: PaymentsService,
  reminders: RemindersService,
  mail: MailService,
  scores: ScoreService,
): Router {
  const router = Router();
  const { requireAuth, requireAdmin } = createAuthGuards(t);

  router.use(requireAuth);

  // A debtor's own loans, with schedule and payments — their Home page.
  router.get('/mine', (req: AuthenticatedRequest, res) => {
    res.json(loans.listDetailed({ borrowerId: req.user!.id }).map((l) => loans.detailForDebtor(l.id)));
  });

  // A debtor's own payment score — their Home and My Account.
  router.get('/score/me', (req: AuthenticatedRequest, res) => {
    res.json(scores.forBorrower(req.user!.id));
  });

  router.get('/scores', requireAdmin, (_req, res) => {
    res.json(scores.all());
  });

  router.get('/score/:userId', requireAdmin, (req, res) => {
    res.json(scores.forBorrower(routeParam(req.params.userId)));
  });

  // One loan: the admin sees any, a debtor only their own (404 otherwise, not 403, so ids don't leak).
  router.get('/:id', (req: AuthenticatedRequest, res) => {
    const id = routeParam(req.params.id);
    if (req.user!.role === 'admin') return res.json(loans.detail(id));
    if (loans.getRaw(id).borrower_id !== req.user!.id) throw notFound();
    return res.json(loans.detailForDebtor(id));
  });

  router.use(requireAdmin);

  /** `?detailed=1` includes schedules and payments — what the dashboards and charts aggregate. */
  router.get('/', (req, res) => {
    const borrowerId = typeof req.query.borrowerId === 'string' ? req.query.borrowerId : undefined;
    res.json(req.query.detailed ? loans.listDetailed({ borrowerId }) : loans.list({ borrowerId }));
  });

  router.post('/preview', (req, res) => {
    res.json(loans.preview(req.body as LoanInput));
  });

  router.post('/', (req: AuthenticatedRequest, res) => {
    const created = loans.create(req.body as LoanInput);
    logger.system.info(`"${req.user!.username}" created loan "${created.title}" for "${created.borrower.username}"`);
    res.status(201).json(created);
  });

  router.patch('/:id', (req: AuthenticatedRequest, res) => {
    const updated = loans.update(routeParam(req.params.id), req.body as LoanInput);
    logger.system.info(`"${req.user!.username}" updated loan "${updated.title}"`);
    res.json(updated);
  });

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = routeParam(req.params.id);
      const loan = loans.getRaw(id);
      await payments.removeLoanReceipts(id);
      loans.remove(id);
      logger.system.info(`"${(req as AuthenticatedRequest).user!.username}" deleted loan "${loan.title}"`);
      res.status(204).end();
    }),
  );

  // Lender registers a payment by hand (cash, transfer seen in their own bank...).
  router.post('/:id/payments', (req: AuthenticatedRequest, res) => {
    const { amount, paidOn, note } = req.body as { amount?: unknown; paidOn?: unknown; note?: unknown };
    payments.addManual(req.user!, routeParam(req.params.id), toCents(amount), paidOn, note);
    res.status(201).json(loans.detail(routeParam(req.params.id)));
  });

  router.post(
    '/:id/remind',
    asyncHandler(async (req, res) => {
      if (!mail.isConfigured()) throw badRequest('mail.notConfigured');
      const sent = await reminders.sendNow(routeParam(req.params.id));
      if (!sent) throw badRequest('mail.sendFailed');
      res.json({ success: true });
    }),
  );

  return router;
}
