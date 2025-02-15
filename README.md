# Decide Backend

Break large problems into smaller parts. Instead of choosing among many options at once, Decide uses pairwise comparisons to simplify decision-making.

[Decide Fronend](https://github.com/pettiboy/decide-frontend) consumes these APIs.

Try the app - [decide.pettiboy.com](https://decide.pettiboy.com/)

## Getting Started

### Running with docker compose

```zsh
docker compose up
```

### Running locally for dev

```zsh
docker compose up db

npx prisma generate
npx prisma migrate deploy

npm run dev
```

### Database Migrations

After making changes to the Prisma schema (`prisma/schema.prisma`), follow these steps:

1. Create a new migration:

```zsh
npx prisma migrate dev
```

This command will:

- Detect changes in your Prisma schema
- Create a new migration file
- Apply the migration to your database
- Generate the Prisma Client

2. For production deployments, use:

```zsh
npx prisma migrate deploy
```

This will apply any pending migrations to your database.

## Credits

This is just a simplified version of [gavel](https://github.com/anishathalye/gavel)
