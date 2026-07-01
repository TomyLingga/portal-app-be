CREATE TABLE IF NOT EXISTS "login_songs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" varchar(150) NOT NULL,
	"filename" varchar(255),
	"is_active" boolean NOT NULL DEFAULT false
);
