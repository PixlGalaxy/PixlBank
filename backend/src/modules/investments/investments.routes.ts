import { Router } from 'express';
import type { Translate } from '../../i18n/index.js';
import type { AuthenticatedRequest } from '../auth/session.middleware.js';
import { createAuthGuards } from '../auth/session.middleware.js';
import { routeParam } from '../../route-params.js';
import { notFound } from '../../errors.js';
import { isIsoDate } from '../loans/dates.js';
import { logger } from '../../logger.js';
import type { InvestmentInput, InvestmentsService, MovementInput } from './investments.service.js';

export function createInvestmentsRoutes(t: Translate, investments: InvestmentsService): Router {
  const router = Router();
  const { requireAuth, requireAdmin } = createAuthGuards(t);
  const horizonOf = (value: unknown) => (isIsoDate(value) ? value : undefined);

  router.use(requireAuth);

  // The account's own investments — read-only, like its loans.
  router.get('/mine', (req: AuthenticatedRequest, res) => {
    res.json(investments.list(req.user!.id));
  });

  /**
   * `?horizon=YYYY-MM-DD` projects up to that date; `&ignoreEnd=1` as if the
   * investment carried on past its end date.
   */
  router.get('/:id', (req: AuthenticatedRequest, res) => {
    const id = routeParam(req.params.id);
    // 404 rather than 403 for someone else's, so ids don't leak.
    if (req.user!.role !== 'admin' && investments.ownerOf(id) !== req.user!.id) throw notFound();
    res.json(investments.detail(id, horizonOf(req.query.horizon), req.query.ignoreEnd === '1'));
  });

  router.use(requireAdmin);

  router.get('/', (req, res) => {
    res.json(investments.list(typeof req.query.ownerId === 'string' ? req.query.ownerId : undefined));
  });

  router.post('/', (req: AuthenticatedRequest, res) => {
    const created = investments.create(req.body as InvestmentInput);
    logger.system.info(`"${req.user!.username}" created investment "${created.title}" with "${created.owner.username}"`);
    res.status(201).json(created);
  });

  router.patch('/:id', (req: AuthenticatedRequest, res) => {
    const updated = investments.update(routeParam(req.params.id), req.body as InvestmentInput);
    logger.system.info(`"${req.user!.username}" updated investment "${updated.title}"`);
    res.json(updated);
  });

  router.delete('/:id', (req: AuthenticatedRequest, res) => {
    investments.remove(routeParam(req.params.id));
    logger.system.info(`"${req.user!.username}" deleted an investment`);
    res.status(204).end();
  });

  router.post('/:id/movements', (req, res) => {
    res.status(201).json(investments.addMovement(routeParam(req.params.id), req.body as MovementInput));
  });

  router.delete('/:id/movements/:movementId', (req, res) => {
    res.json(investments.removeMovement(routeParam(req.params.id), routeParam(req.params.movementId)));
  });

  return router;
}
