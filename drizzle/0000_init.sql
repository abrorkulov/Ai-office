CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"call_id" text NOT NULL,
	"tool" text NOT NULL,
	"input" jsonb NOT NULL,
	"summary" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"result" text DEFAULT '' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approvals_call_uq" UNIQUE("run_id","call_id")
);
--> statement-breakpoint
CREATE TABLE "checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"monitor_id" uuid NOT NULL,
	"ok" boolean NOT NULL,
	"status" integer,
	"latency_ms" integer,
	"error" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"key_enc" text NOT NULL,
	"key_hint" text NOT NULL,
	"base_url" text,
	"default_model" text NOT NULL,
	"price_in" numeric(10, 4),
	"price_out" numeric(10, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_org_id_uq" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_org_id_uq" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"owner_id" uuid,
	"title" text NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "deals_org_id_uq" UNIQUE("org_id","id"),
	CONSTRAINT "deals_amount_ck" CHECK ("deals"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"folder" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"author_id" uuid,
	"author_name" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "docs_org_id_uq" UNIQUE("org_id","id"),
	CONSTRAINT "docs_title_len" CHECK (char_length("docs"."title") between 1 and 160),
	CONSTRAINT "docs_body_len" CHECK (char_length("docs"."body") <= 60000)
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"actor_name" text NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"staff_id" uuid,
	"task_id" uuid,
	"audit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"author" text NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"text" text NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"every_min" integer DEFAULT 5 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"state" text DEFAULT 'unknown' NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitors_org_id_uq" UNIQUE("org_id","id"),
	CONSTRAINT "monitors_every_ck" CHECK ("monitors"."every_min" between 1 and 1440)
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"author_type" text NOT NULL,
	"author_name" text NOT NULL,
	"author_id" text,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"demo_expires_at" timestamp with time zone,
	"join_token_hash" text,
	"join_domain" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_join_token_hash_unique" UNIQUE("join_token_hash")
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"task_id" uuid,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"prompt" text NOT NULL,
	"trusted" text DEFAULT '' NOT NULL,
	"output" text DEFAULT '' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"snapshot" jsonb,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pending" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "runs_org_id_uq" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"goal" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sprints_org_id_uq" UNIQUE("org_id","id"),
	CONSTRAINT "sprints_dates_ck" CHECK ("sprints"."ends_at" > "sprints"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"department" text NOT NULL,
	"avatar" text NOT NULL,
	"floor" integer DEFAULT 1 NOT NULL,
	"seat" integer,
	"presence" text DEFAULT 'available' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"connection_id" uuid,
	"model" text DEFAULT 'claude-opus-5-5' NOT NULL,
	"effort" text DEFAULT 'medium' NOT NULL,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"autonomy" text DEFAULT 'ask' NOT NULL,
	"daily_run_limit" integer DEFAULT 25 NOT NULL,
	"schedule_every_min" integer,
	"schedule_prompt" text DEFAULT '' NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "staff_org_id_uq" UNIQUE("org_id","id"),
	CONSTRAINT "staff_floor_ck" CHECK ("staff"."floor" in (1, 2)),
	CONSTRAINT "staff_schedule_ck" CHECK ("staff"."schedule_every_min" is null or "staff"."schedule_every_min" >= 15)
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"assignee_id" uuid NOT NULL,
	"parent_id" uuid,
	"sprint_id" uuid,
	"type" text DEFAULT 'task' NOT NULL,
	"delegator_id" uuid,
	"title" text NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"due_at" timestamp with time zone,
	"result" text DEFAULT '' NOT NULL,
	"project" text DEFAULT '' NOT NULL,
	"points" integer,
	"link" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_by_id" uuid,
	"by_ai" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "tasks_org_id_uq" UNIQUE("org_id","id"),
	CONSTRAINT "tasks_points_ck" CHECK ("tasks"."points" is null or "tasks"."points" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_run_fk" FOREIGN KEY ("org_id","run_id") REFERENCES "public"."runs"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_staff_fk" FOREIGN KEY ("org_id","staff_id") REFERENCES "public"."staff"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_monitor_fk" FOREIGN KEY ("org_id","monitor_id") REFERENCES "public"."monitors"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_contact_fk" FOREIGN KEY ("org_id","contact_id") REFERENCES "public"."contacts"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_fk" FOREIGN KEY ("org_id","owner_id") REFERENCES "public"."staff"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_staff_fk" FOREIGN KEY ("org_id","staff_id") REFERENCES "public"."staff"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_staff_fk" FOREIGN KEY ("org_id","staff_id") REFERENCES "public"."staff"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_task_fk" FOREIGN KEY ("org_id","task_id") REFERENCES "public"."tasks"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_staff_fk" FOREIGN KEY ("org_id","staff_id") REFERENCES "public"."staff"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_task_fk" FOREIGN KEY ("org_id","task_id") REFERENCES "public"."tasks"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_connection_fk" FOREIGN KEY ("org_id","connection_id") REFERENCES "public"."connections"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_fk" FOREIGN KEY ("org_id","assignee_id") REFERENCES "public"."staff"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_fk" FOREIGN KEY ("org_id","parent_id") REFERENCES "public"."tasks"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_delegator_fk" FOREIGN KEY ("org_id","delegator_id") REFERENCES "public"."staff"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sprint_fk" FOREIGN KEY ("org_id","sprint_id") REFERENCES "public"."sprints"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_org_status_idx" ON "approvals" USING btree ("org_id","status","created_at");--> statement-breakpoint
CREATE INDEX "checks_monitor_idx" ON "checks" USING btree ("org_id","monitor_id","at");--> statement-breakpoint
CREATE INDEX "contacts_org_idx" ON "contacts" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "deals_org_stage_idx" ON "deals" USING btree ("org_id","stage");--> statement-breakpoint
CREATE INDEX "docs_org_idx" ON "docs" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "events_org_idx" ON "events" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "events_staff_idx" ON "events" USING btree ("org_id","staff_id","created_at");--> statement-breakpoint
CREATE INDEX "events_task_idx" ON "events" USING btree ("org_id","task_id","created_at");--> statement-breakpoint
CREATE INDEX "invites_org_idx" ON "invites" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_staff_idx" ON "messages" USING btree ("org_id","staff_id","created_at");--> statement-breakpoint
CREATE INDEX "monitors_due_idx" ON "monitors" USING btree ("next_check_at") WHERE "monitors"."enabled";--> statement-breakpoint
CREATE INDEX "notes_task_idx" ON "notes" USING btree ("org_id","task_id","created_at");--> statement-breakpoint
CREATE INDEX "password_resets_user_idx" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "runs_staff_idx" ON "runs" USING btree ("org_id","staff_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_queue_idx" ON "runs" USING btree ("status","created_at") WHERE "runs"."status" in ('queued','running');--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_exp_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sprints_one_active_uq" ON "sprints" USING btree ("org_id") WHERE "sprints"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "staff_seat_uq" ON "staff" USING btree ("org_id","floor","seat") WHERE "staff"."archived_at" is null and "staff"."seat" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_user_uq" ON "staff" USING btree ("org_id","user_id") WHERE "staff"."archived_at" is null and "staff"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "staff_due_idx" ON "staff" USING btree ("next_run_at") WHERE "staff"."next_run_at" is not null;--> statement-breakpoint
CREATE INDEX "tasks_org_status_idx" ON "tasks" USING btree ("org_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("org_id","assignee_id");--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("org_id","parent_id");--> statement-breakpoint
CREATE INDEX "tasks_sprint_idx" ON "tasks" USING btree ("org_id","sprint_id");