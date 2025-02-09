# Decision

Break large problems into smaller parts. Instead of choosing among many options at once, Decide uses pairwise comparisons to simplify decision-making.

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

## Credits

This is just a simplified version of [gavel](https://github.com/anishathalye/gavel)
