FROM node:22-alpine

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @amazon-2/api prisma:generate && pnpm build

EXPOSE 3000

CMD ["sh", "-c", "pnpm --filter @amazon-2/api prisma:migrate:deploy && pnpm --filter @amazon-2/api start"]
