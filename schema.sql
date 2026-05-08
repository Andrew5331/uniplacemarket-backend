-- ============================================
-- SABANA MARKET — Schema PostgreSQL
-- Ejecutar en psql o pgAdmin
-- ============================================

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TABLA: users
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  user_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(150) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,         -- bcrypt hash
  career      VARCHAR(100),                  -- opcional
  photo_url   VARCHAR(500),                  -- ruta local o S3
  is_seller   BOOLEAN NOT NULL DEFAULT FALSE,
  reputation  NUMERIC(3,2) NOT NULL DEFAULT 0.00,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TABLA: categories
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(50) UNIQUE NOT NULL
);

-- Datos iniciales de categorías
INSERT INTO categories (name) VALUES
  ('Libros'),
  ('Electrónica'),
  ('Útiles'),
  ('Accesorios'),
  ('Ropa'),
  ('Deportes'),
  ('Otros')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- TABLA: products
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  product_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(category_id),
  title       VARCHAR(100) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  price       NUMERIC(12,2) NOT NULL CHECK (price > 0),
  condition   VARCHAR(10) NOT NULL CHECK (condition IN ('new', 'used')),
  stock       INTEGER NOT NULL DEFAULT 1,
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'sold', 'deleted')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TABLA: product_images
-- ============================================
CREATE TABLE IF NOT EXISTS product_images (
  image_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  url         VARCHAR(500) NOT NULL,
  position    SMALLINT NOT NULL DEFAULT 0
);

-- ============================================
-- TABLA: orders
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  order_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(product_id),
  buyer_id    UUID NOT NULL REFERENCES users(user_id),
  seller_id   UUID NOT NULL REFERENCES users(user_id),
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','confirmed','delivered','completed','cancelled')),
  message     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TABLA: reviews
-- ============================================
CREATE TABLE IF NOT EXISTS reviews (
  review_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL UNIQUE REFERENCES orders(order_id),
  buyer_id    UUID NOT NULL REFERENCES users(user_id),
  seller_id   UUID NOT NULL REFERENCES users(user_id),
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TABLA: conversations
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(product_id),
  buyer_id        UUID NOT NULL REFERENCES users(user_id),
  seller_id       UUID NOT NULL REFERENCES users(user_id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, buyer_id)
);

-- ============================================
-- TABLA: messages
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  message_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(user_id),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TABLA: notifications
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  type            VARCHAR(50) NOT NULL,
  message         TEXT NOT NULL,
  read            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- FUNCIÓN: recalcular reputación al insertar reseña
-- ============================================
CREATE OR REPLACE FUNCTION update_seller_reputation()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users
  SET reputation = (
    SELECT COALESCE(AVG(rating), 0)
    FROM reviews
    WHERE seller_id = NEW.seller_id
  )
  WHERE user_id = NEW.seller_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_update_reputation
AFTER INSERT OR UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_seller_reputation();

-- ============================================
-- FUNCIÓN: updated_at automático en products
-- ============================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
