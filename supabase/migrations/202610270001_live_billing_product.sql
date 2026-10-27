-- Select the owner-created live ₹99 monthly product, but keep all purchases disabled.
-- The operator enables the rollout only after live API/webhook keys are saved in Netlify.
update public.billing_config
set enabled = false,
    environment = 'live_mode',
    product_id = 'pdt_0NqegAAJpk3ARtAmQeqCF',
    started_at = now()
where singleton = true;
