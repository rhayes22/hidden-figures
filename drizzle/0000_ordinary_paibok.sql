CREATE TYPE "public"."chamber" AS ENUM('house', 'senate');--> statement-breakpoint
CREATE TYPE "public"."vote_position" AS ENUM('yea', 'nay', 'present', 'not_voting');--> statement-breakpoint
CREATE TABLE "bills" (
	"id" text PRIMARY KEY NOT NULL,
	"congress" integer NOT NULL,
	"bill_type" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"short_title" text,
	"summary" text,
	"status" text,
	"latest_action_date" date
);
--> statement-breakpoint
CREATE TABLE "legislators" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"party" text NOT NULL,
	"state" text NOT NULL,
	"district" text,
	"chamber" "chamber" NOT NULL,
	"in_office" boolean DEFAULT true NOT NULL,
	"photo_url" text,
	"term_start" date,
	"term_end" date
);
--> statement-breakpoint
CREATE TABLE "roll_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"chamber" "chamber" NOT NULL,
	"congress" integer NOT NULL,
	"session" integer NOT NULL,
	"roll_number" integer NOT NULL,
	"vote_date" date NOT NULL,
	"question" text NOT NULL,
	"result" text NOT NULL,
	"bill_id" text
);
--> statement-breakpoint
CREATE TABLE "vote_positions" (
	"roll_call_id" text NOT NULL,
	"legislator_id" text NOT NULL,
	"position" "vote_position" NOT NULL,
	CONSTRAINT "vote_positions_roll_call_id_legislator_id_pk" PRIMARY KEY("roll_call_id","legislator_id")
);
--> statement-breakpoint
ALTER TABLE "roll_calls" ADD CONSTRAINT "roll_calls_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_positions" ADD CONSTRAINT "vote_positions_roll_call_id_roll_calls_id_fk" FOREIGN KEY ("roll_call_id") REFERENCES "public"."roll_calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_positions" ADD CONSTRAINT "vote_positions_legislator_id_legislators_id_fk" FOREIGN KEY ("legislator_id") REFERENCES "public"."legislators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roll_calls_bill_id_idx" ON "roll_calls" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "roll_calls_vote_date_idx" ON "roll_calls" USING btree ("vote_date");--> statement-breakpoint
CREATE INDEX "vote_positions_legislator_id_idx" ON "vote_positions" USING btree ("legislator_id");