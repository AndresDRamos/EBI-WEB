-- V3__auth_schema.sql
-- Portal-owned authentication & RBAC (plan 0002-portal-owned-auth).
-- Replaces Entra/MSAL login: the portal becomes the identity provider.
-- Dedicated `auth` schema for clean least-privilege grants (CRUD to ebi_app,
-- read to ebi_agent_ro). Session strategy is JWT (Auth.js Credentials) ->
-- NO session table. Idempotent guards for safe re-runs in dev.
-- Target: Azure SQL (EBI_dev / EBI).

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
IF SCHEMA_ID(N'auth') IS NULL EXEC(N'CREATE SCHEMA auth');
GO

-- ---------------------------------------------------------------------------
-- auth.app_user — portal accounts (login identity is `username`)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'auth.app_user', N'U') IS NULL
BEGIN
    CREATE TABLE auth.app_user
    (
        user_id       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_app_user PRIMARY KEY,
        username      NVARCHAR(64)  NOT NULL,            -- login id
        email         NVARCHAR(256) NULL,                -- optional (invitation/notification)
        display_name  NVARCHAR(160) NULL,
        password_hash NVARCHAR(256) NULL,                -- null until invite accepted (argon2id/bcrypt)
        all_plants    BIT NOT NULL CONSTRAINT DF_app_user_all_plants DEFAULT (0),
        is_active     BIT NOT NULL CONSTRAINT DF_app_user_active    DEFAULT (1),
        token_version INT NOT NULL CONSTRAINT DF_app_user_token_ver DEFAULT (0), -- bump to invalidate JWTs
        created_at    DATETIME2(0) NOT NULL CONSTRAINT DF_app_user_created DEFAULT (SYSUTCDATETIME()),
        updated_at    DATETIME2(0) NOT NULL CONSTRAINT DF_app_user_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_app_user_username UNIQUE (username)
    );
END
GO

-- ---------------------------------------------------------------------------
-- auth.role — RBAC roles (seeded: admin, viewer)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'auth.role', N'U') IS NULL
BEGIN
    CREATE TABLE auth.role
    (
        role_id     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_role PRIMARY KEY,
        name        NVARCHAR(40)  NOT NULL,
        description NVARCHAR(256) NULL,
        CONSTRAINT UQ_role_name UNIQUE (name)
    );
END
GO

-- ---------------------------------------------------------------------------
-- auth.plant — plant catalog (admin-managed; may later map to EPS plant ids)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'auth.plant', N'U') IS NULL
BEGIN
    CREATE TABLE auth.plant
    (
        plant_id   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_plant PRIMARY KEY,
        code       NVARCHAR(32)  NOT NULL,
        name       NVARCHAR(160) NOT NULL,
        is_active  BIT NOT NULL CONSTRAINT DF_plant_active DEFAULT (1),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_plant_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_plant_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_plant_code UNIQUE (code)
    );
END
GO

-- ---------------------------------------------------------------------------
-- auth.department — department catalog (admin-managed)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'auth.department', N'U') IS NULL
BEGIN
    CREATE TABLE auth.department
    (
        department_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_department PRIMARY KEY,
        name          NVARCHAR(160) NOT NULL,
        is_active     BIT NOT NULL CONSTRAINT DF_department_active DEFAULT (1),
        created_at    DATETIME2(0) NOT NULL CONSTRAINT DF_department_created DEFAULT (SYSUTCDATETIME()),
        updated_at    DATETIME2(0) NOT NULL CONSTRAINT DF_department_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_department_name UNIQUE (name)
    );
END
GO

-- ---------------------------------------------------------------------------
-- auth.user_role — user <-> role (many-to-many)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'auth.user_role', N'U') IS NULL
BEGIN
    CREATE TABLE auth.user_role
    (
        user_id INT NOT NULL,
        role_id INT NOT NULL,
        CONSTRAINT PK_user_role PRIMARY KEY (user_id, role_id),
        CONSTRAINT FK_user_role_user FOREIGN KEY (user_id)
            REFERENCES auth.app_user (user_id) ON DELETE CASCADE,
        CONSTRAINT FK_user_role_role FOREIGN KEY (role_id)
            REFERENCES auth.role (role_id)              -- no cascade: protect catalog rows
    );

    CREATE INDEX IX_user_role_role ON auth.user_role (role_id);
END
GO

-- ---------------------------------------------------------------------------
-- auth.user_plant — user <-> plant (many-to-many; ignored when all_plants=1)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'auth.user_plant', N'U') IS NULL
BEGIN
    CREATE TABLE auth.user_plant
    (
        user_id  INT NOT NULL,
        plant_id INT NOT NULL,
        CONSTRAINT PK_user_plant PRIMARY KEY (user_id, plant_id),
        CONSTRAINT FK_user_plant_user FOREIGN KEY (user_id)
            REFERENCES auth.app_user (user_id) ON DELETE CASCADE,
        CONSTRAINT FK_user_plant_plant FOREIGN KEY (plant_id)
            REFERENCES auth.plant (plant_id)            -- no cascade: protect catalog rows
    );

    CREATE INDEX IX_user_plant_plant ON auth.user_plant (plant_id);
END
GO

-- ---------------------------------------------------------------------------
-- auth.user_department — user <-> department (many-to-many)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'auth.user_department', N'U') IS NULL
BEGIN
    CREATE TABLE auth.user_department
    (
        user_id       INT NOT NULL,
        department_id INT NOT NULL,
        CONSTRAINT PK_user_department PRIMARY KEY (user_id, department_id),
        CONSTRAINT FK_user_department_user FOREIGN KEY (user_id)
            REFERENCES auth.app_user (user_id) ON DELETE CASCADE,
        CONSTRAINT FK_user_department_department FOREIGN KEY (department_id)
            REFERENCES auth.department (department_id)   -- no cascade: protect catalog rows
    );

    CREATE INDEX IX_user_department_department ON auth.user_department (department_id);
END
GO

-- ---------------------------------------------------------------------------
-- auth.invitation — one-time token to activate a pre-created inactive user
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'auth.invitation', N'U') IS NULL
BEGIN
    CREATE TABLE auth.invitation
    (
        invitation_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_invitation PRIMARY KEY,
        user_id       INT NOT NULL,                     -- the pre-created inactive user
        token_hash    NVARCHAR(128) NOT NULL,           -- hash of the one-time token (never the raw token)
        expires_at    DATETIME2(0) NOT NULL,
        accepted_at   DATETIME2(0) NULL,
        created_by    INT NULL,                          -- admin app_user who issued the invite
        created_at    DATETIME2(0) NOT NULL CONSTRAINT DF_invitation_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_invitation_token UNIQUE (token_hash),
        CONSTRAINT FK_invitation_user FOREIGN KEY (user_id)
            REFERENCES auth.app_user (user_id) ON DELETE CASCADE,
        CONSTRAINT FK_invitation_created_by FOREIGN KEY (created_by)
            REFERENCES auth.app_user (user_id)          -- no cascade (avoids multiple cascade paths)
    );

    CREATE INDEX IX_invitation_user ON auth.invitation (user_id);
END
GO

-- ---------------------------------------------------------------------------
-- Seed RBAC roles (idempotent)
-- ---------------------------------------------------------------------------
MERGE auth.role AS tgt
USING (VALUES
    (N'admin',  N'Full administrative access (user, catalog and report management)'),
    (N'viewer', N'Read-only access to assigned content')
) AS src (name, description)
    ON tgt.name = src.name
WHEN NOT MATCHED BY TARGET THEN
    INSERT (name, description) VALUES (src.name, src.description);
GO

-- ---------------------------------------------------------------------------
-- Grants (least privilege).
-- ebi_migrator owns/creates the schema. If these principals do not yet exist
-- in EBI_dev/EBI, run the GRANT block from the runbook AFTER creating them.
-- Wrapped in guards so the migration does not fail when a user is absent.
-- ---------------------------------------------------------------------------
IF DATABASE_PRINCIPAL_ID(N'ebi_app') IS NOT NULL
    EXEC(N'GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::auth TO ebi_app');
GO
IF DATABASE_PRINCIPAL_ID(N'ebi_agent_ro') IS NOT NULL
    EXEC(N'GRANT SELECT ON SCHEMA::auth TO ebi_agent_ro');
GO
