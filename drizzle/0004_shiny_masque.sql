CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"script" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"exit_code" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sync_runs_script_finished_at_idx" ON "sync_runs" USING btree ("script","finished_at");