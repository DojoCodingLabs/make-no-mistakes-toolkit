-- # hook-bypass: schema-sql-outside-migrations
-- Audit-engine test fixture (not a migration). Normalized via profile_id FKs.
CREATE TABLE profiles (id uuid PRIMARY KEY, bio text, github_url text);
CREATE TABLE hackathon_members (id uuid PRIMARY KEY, profile_id uuid REFERENCES profiles(id));
CREATE TABLE blog_authors (id uuid PRIMARY KEY, profile_id uuid REFERENCES profiles(id));
