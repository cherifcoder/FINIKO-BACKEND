import { Router } from 'express';
import { adminFinanceQuerySchema, type AdminFinanceQuery } from '@finiko/contracts';
import { authenticate, requireRole } from '../../middleware/authenticate';
import { validateQuery } from '../../middleware/validate';
import { success } from '../../utils/http';
import { getAdminFinanceSummary } from './finance.service';

export const adminFinancesRouter = Router();

adminFinancesRouter.use(authenticate, requireRole('admin'));

adminFinancesRouter.get('/', validateQuery(adminFinanceQuerySchema), async (req, res) => {
  const query = req.validatedQuery as AdminFinanceQuery;
  const summary = await getAdminFinanceSummary(query);

  res.status(200).json(success(summary));
});
