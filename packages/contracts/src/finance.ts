import { z } from 'zod';
import type { PaymentProvider, PaymentPurpose, PaymentStatus } from './enums';

export const adminFinanceQuerySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
export type AdminFinanceQuery = z.infer<typeof adminFinanceQuerySchema>;

export interface AdminFinancePeriod {
  from: string;
  to: string;
}

export interface AdminFinanceTotals {
  collected: number;
  pending: number;
  refunded: number;
  net: number;
  orderRevenue: number;
  subscriptionRevenue: number;
}

export interface AdminFinanceOrders {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  averageBasket: number;
}

export interface AdminFinancePayments {
  successful: number;
  pending: number;
  failed: number;
}

export interface AdminFinanceProviderBreakdown {
  provider: PaymentProvider;
  amountXOF: number;
  count: number;
}

export interface AdminPaymentTransaction {
  id: string;
  reference: string;
  purpose: PaymentPurpose;
  provider: PaymentProvider;
  amountXOF: number;
  status: PaymentStatus;
  clientName: string;
  orderNumber: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface AdminFinanceSummary {
  period: AdminFinancePeriod;
  totals: AdminFinanceTotals;
  orders: AdminFinanceOrders;
  payments: AdminFinancePayments;
  providers: AdminFinanceProviderBreakdown[];
  recentTransactions: AdminPaymentTransaction[];
}
