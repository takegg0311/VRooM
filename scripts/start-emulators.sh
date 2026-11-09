#!/bin/sh
# Firebase Emulator Suite を起動し、テストアカウントを作成する（docker compose の firebase サービス用）
set -e

PROJECT_ID="${FIREBASE_PROJECT_ID:-demo-vroom}"
DATA_DIR=/data

# テストアカウントの作成（エミュレータの起動を待ってから。既に存在する場合はエラーになるが無視）
(
  until curl -s -o /dev/null http://localhost:9099/; do sleep 1; done
  curl -s -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${TEST_ACCOUNT_EMAIL}\",\"password\":\"${TEST_ACCOUNT_PASSWORD}\",\"returnSecureToken\":true}" \
    "http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key" \
    | grep -q idToken \
    && echo "[seed] テストアカウントを作成しました: ${TEST_ACCOUNT_EMAIL}" \
    || echo "[seed] テストアカウントは作成済みです: ${TEST_ACCOUNT_EMAIL}"
) &

# 停止時のエクスポート先は既存ディレクトリだと失敗するため、毎回 export-new に書き出し、
# 次回起動時に export へ入れ替えてから読み込む
if [ -f "${DATA_DIR}/export-new/firebase-export-metadata.json" ]; then
  rm -rf "${DATA_DIR}/export"
  mv "${DATA_DIR}/export-new" "${DATA_DIR}/export"
fi
rm -rf "${DATA_DIR}/export-new"
IMPORT_OPT=""
if [ -f "${DATA_DIR}/export/firebase-export-metadata.json" ]; then
  IMPORT_OPT="--import=${DATA_DIR}/export"
fi

exec firebase emulators:start \
  --project "${PROJECT_ID}" \
  --only auth,firestore \
  ${IMPORT_OPT} \
  --export-on-exit="${DATA_DIR}/export-new"
