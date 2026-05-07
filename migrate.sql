-- Ejecutar en psql: \i C:/Proyectos/backend/migrate.sql

-- Agregar product_id a reviews (reseña por producto, no por orden)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(product_id);

-- Hacer order_id opcional
ALTER TABLE reviews ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_order_id_key;

-- Agregar campo helpful (utilidad de la reseña)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS helpful INTEGER NOT NULL DEFAULT 0;

-- Índice único: un usuario solo puede reseñar un producto una vez
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_product_buyer ON reviews(product_id, buyer_id);

-- Actualizar trigger de reputación para usar product_id
CREATE OR REPLACE FUNCTION update_seller_reputation()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users
  SET reputation = (
    SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)
    FROM reviews
    WHERE seller_id = NEW.seller_id
  )
  WHERE user_id = NEW.seller_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
