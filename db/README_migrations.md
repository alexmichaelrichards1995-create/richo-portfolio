DB & Migrations

Place SQL migration files in ../migrations and apply with your migration runner. This repository includes a sample migration for subscriptions (001_create_subscriptions_table.sql).

Suggested tools:
- node: knex
- Go: golang-migrate
- Flyway/Liquibase

CI should run migrations against a transient test DB before running integration tests.