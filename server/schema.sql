-- SignFlow database schema (MySQL 8+). Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin') DEFAULT 'user',
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    password_hash VARCHAR(255) NULL,
    is_ldap_user BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_role (role)
);

CREATE TABLE IF NOT EXISTS documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100),
    size BIGINT,
    status ENUM('pending', 'in-progress', 'completed', 'cancelled', 'sent', 'draft', 'declined') DEFAULT 'pending',
    signers JSON,
    upload_date DATE,
    uploaded_by VARCHAR(255),
    signature_data JSON NULL,
    signature_fields JSON NULL,
    message TEXT NULL,
    expires_at DATETIME NULL,
    completed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_uploaded_by (uploaded_by),
    INDEX idx_status (status),
    INDEX idx_expires_at (expires_at)
);

CREATE TABLE IF NOT EXISTS audit_trail_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT NULL,
    event_type VARCHAR(50) NOT NULL,
    actor_email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSON,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_document (document_id),
    INDEX idx_audit_timestamp (timestamp),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS document_files (
    document_id INT NOT NULL,
    kind ENUM('original', 'signed') NOT NULL,
    data LONGBLOB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (document_id, kind),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);
