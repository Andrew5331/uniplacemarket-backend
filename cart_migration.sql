-- Ejecutar en Neon antes del deploy: \i cart_migration.sql

-- Tabla de carritos (uno por usuario)
CREATE TABLE IF NOT EXISTS carts (
  cart_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla de ítems del carrito
CREATE TABLE IF NOT EXISTS cart_items (
  cart_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id      UUID NOT NULL REFERENCES carts(cart_id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cart_id, product_id)
);

-- Snapshot del precio al momento de crear la orden
ALTER TABLE orders ADD COLUMN IF NOT EXISTS price NUMERIC(12,2);
