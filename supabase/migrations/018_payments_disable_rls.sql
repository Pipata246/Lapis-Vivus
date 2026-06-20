-- Migration: 018_payments_disable_rls
-- Description: payments — только сервер (service_role), RLS мешал начислению

ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.payments TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_balance_for_payment(TEXT) TO service_role;
