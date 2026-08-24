DROP TABLE "user_notification_status" CASCADE;
--> statement-breakpoint
DROP TABLE "notification" CASCADE;
--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"app_id" uuid,
	"action" varchar(100) NOT NULL,
	"details" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_app_id_aplikasi_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."aplikasi"("id") ON DELETE cascade ON UPDATE no action;
