#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:?Usage: check-runtime.sh /path/to/release/server}"
NODE_BIN="$APP_ROOT/runtime/bin/node"
if [[ ! -x "$NODE_BIN" ]]; then
  echo 'The release is missing its packaged Node.js runtime. Build it in CI before deploying.' >&2
  exit 1
fi
"$NODE_BIN" -e 'if(process.platform!=="linux" || process.arch!=="x64" || Number(process.versions.node.split(".")[0])!==24){console.error("This release requires Linux x64 Node.js 24");process.exit(1);}console.log(`Packaged runtime: ${process.version} (${process.platform}/${process.arch})`);'
cd "$APP_ROOT"
"$NODE_BIN" --input-type=module -e '
  await import("pg");
  await import("file-type");
  await import("heic-decode");
  const {default:sharp}=await import("sharp");
  const image=await sharp({create:{width:2,height:1,channels:3,background:"white"}}).jpeg().toBuffer();
  if(!image.length)throw new Error("JPEG encoder unavailable");
  console.log("Packaged API dependencies and native JPEG encoder are ready");
'
