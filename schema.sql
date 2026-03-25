CREATE TABLE IF NOT EXISTS pos_businesses (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  created_at DATETIME NULL,
  UNIQUE KEY uq_pos_businesses_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_data (
  business_id VARCHAR(64) NOT NULL PRIMARY KEY,
  payload LONGTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pos_data_business
    FOREIGN KEY (business_id) REFERENCES pos_businesses(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_users (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  username VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(200) NOT NULL DEFAULT '',
  role VARCHAR(32) NOT NULL,
  business_id VARCHAR(64) NULL,
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  permissions JSON NULL,
  created_at DATETIME NULL,
  UNIQUE KEY uq_pos_users_username (username),
  KEY idx_pos_users_business (business_id),
  CONSTRAINT fk_pos_users_business
    FOREIGN KEY (business_id) REFERENCES pos_businesses(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
