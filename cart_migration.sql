-- Ejecutar en Neon antes del deploy
-- DROP garantiza schema correcto aunque la tabla ya existiera con columnas diferentes

DROP TABLE IF EXISTS cart_items;
DROP TABLE IF EXISTS carts;

CREATE TABLE carts (
  cart_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cart_items (
  cart_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id      UUID NOT NULL REFERENCES carts(cart_id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cart_id, product_id)
);

-- Snapshot del precio al momento de crear la orden
ALTER TABLE orders ADD COLUMN IF NOT EXISTS price NUMERIC(12,2);
