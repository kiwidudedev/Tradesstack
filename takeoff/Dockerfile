FROM node:22-bookworm-slim

WORKDIR /workspace
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
# tsx is a runtime dependency for the TypeScript entrypoint; omit the rest of
# the repository's development toolchain from this production image.
RUN npm install --omit=dev --ignore-scripts=false --no-audit --no-fund
# Next's server-only package is a compile-time boundary marker. The native
# renderer runs outside Next, so replace only the image-local marker with a
# no-op while keeping the application source guard intact.
RUN node -e "require('fs').writeFileSync('node_modules/server-only/index.js', 'module.exports = {};\\n')"
COPY . .

EXPOSE 8787
CMD ["node", "--import", "tsx", "scripts/takeoff-container-server.ts"]
