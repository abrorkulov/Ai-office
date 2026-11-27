-- Изоляция компаний на уровне базы. Запросы к данным компании выполняет роль app_tenant
-- (без BYPASSRLS) внутри транзакции, где задан app.org_id. Забытый фильтр в коде не раскроет чужие строки.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant NOLOGIN NOINHERIT;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN EXECUTE format('GRANT app_tenant TO %I', current_user); END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_tenant;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_org_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['connections','staff','contacts','deals','tasks','runs','approvals','messages','monitors','checks','events','notes','sprints','docs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I TO app_tenant USING (org_id = (SELECT app_org_id())) WITH CHECK (org_id = (SELECT app_org_id()))', t);
    -- владелец таблиц нужен фоновому обработчику, внешним ключам и миграциям
    EXECUTE format('CREATE POLICY system_access ON %I TO %I USING (true) WITH CHECK (true)', t, current_user);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_tenant', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- журнал нельзя переписать или удалить из приложения
REVOKE UPDATE, DELETE ON events FROM app_tenant;
