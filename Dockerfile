FROM node:16.14.2
WORKDIR /app

# Firebase Emulator（Firestore）の実行に Java 11+ が必要。
# ベースイメージは Debian 10 (buster) でサポート終了のため、アーカイブのリポジトリを参照する。
RUN sed -i "s|deb.debian.org|archive.debian.org|g; /buster-updates/d; s|security.debian.org/debian-security|archive.debian.org/debian-security|g" /etc/apt/sources.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends openjdk-11-jre-headless \
  && rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock ./
RUN yarn install
# npm-shrinkwrap.json で依存を固定させるため yarn ではなく npm で入れる
RUN npm install -g firebase-tools@11.16.0
# --prod --frozen-lockfile

COPY . .

EXPOSE 3000
CMD ["yarn", "dev"]
