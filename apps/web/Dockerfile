FROM node:22-alpine

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @amazon-2/contracts build

EXPOSE 5173

CMD ["pnpm", "--filter", "@amazon-2/web", "dev"]
