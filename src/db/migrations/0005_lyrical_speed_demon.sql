CREATE TABLE "user_passkey" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" varchar(500) NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"transports" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_passkey_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
ALTER TABLE "user_passkey" ADD CONSTRAINT "user_passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;