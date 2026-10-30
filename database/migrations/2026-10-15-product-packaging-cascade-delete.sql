-- Migration: Cascade delete packaging variants when product is deleted & purge orphans
-- Date: 2026-10-15

-- 1. Purge any existing orphaned packaging variants where product_id does not exist in products
DELETE FROM public.product_packaging
WHERE product_id IS NOT NULL
  AND product_id NOT IN (SELECT id FROM public.products);

-- 2. Ensure foreign key constraint exists with ON DELETE CASCADE
DO $$
BEGIN
  -- Drop existing constraint if named fk_product_packaging_product or similar
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_product_packaging_product'
      AND table_name = 'product_packaging'
  ) THEN
    ALTER TABLE public.product_packaging DROP CONSTRAINT fk_product_packaging_product;
  END IF;

  -- Add the foreign key constraint with CASCADE DELETE
  ALTER TABLE public.product_packaging
    ADD CONSTRAINT fk_product_packaging_product
    FOREIGN KEY (product_id)
    REFERENCES public.products(id)
    ON DELETE CASCADE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Constraint creation notice: %', SQLERRM;
END $$;
